"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { env, hasPayment } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { getPaymentProvider, toSatang } from "@/lib/payment";
import { MOCK_SIGNATURE_HEADER, completeMockCharge } from "@/lib/payment/providers/mock";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { CourseStatus, EnrollmentStatus, OrderStatus, Role } from "@/generated/prisma/enums";
import {
  CHECKOUT_QUOTA,
  COUPON_QUOTA,
  ORDER_STATUS_LABEL,
  ORDER_TTL_MINUTES,
  checkoutSchema,
  couponFormSchema,
  couponIdSchema,
  mockPaySchema,
  orderIdSchema,
  refundSchema,
} from "@/features/commerce/schemas";
import { checkRefund } from "@/features/commerce/lib/refund-rules";
import { courseOffer } from "@/features/commerce/lib/pricing";
import { findCouponQuote } from "@/features/commerce/lib/coupon-store";
import { announcePaid, grantPurchase, settleOrder } from "@/features/commerce/lib/settle";
import { handlePaymentWebhook } from "@/features/commerce/lib/webhook";

/**
 * M18 · FR-18.1 — เริ่มชำระเงิน
 *
 * ราคามาจาก DB ตอนนี้เสมอ (ไม่รับยอดจาก client) · สร้าง `Order` PENDING อายุ 30 นาทีแล้วขอหน้าชำระจากผู้ให้บริการ
 * คำสั่งซื้อ PENDING เดิมของคอร์สเดียวกัน: ถามผลก่อน (อาจจ่ายไปแล้วแต่ webhook ยังไม่มา) ถ้ายังไม่จ่ายปิดเป็น FAILED แล้วสร้างใหม่
 * — charge เก่ายังผูกกับคำสั่งซื้อเดิม ถ้าผู้ซื้อจ่ายตามมาภายหลัง webhook ก็ยังเปิดสิทธิ์ให้ได้ (FAILED → PAID)
 *
 * คูปอง (FR-18.2): ตรวจใหม่ทุกครั้งและล็อกแถวคูปองใน transaction เดียวกับการสร้างคำสั่งซื้อ (จองสิทธิ์ตาม Q7)
 * ลดจนเหลือ 0 บาท → คำสั่งซื้อเป็น PAID และเปิดสิทธิ์ทันทีโดยไม่ผ่าน gateway
 */
export async function startCheckout(formData: FormData): Promise<ActionResult & { redirectUrl?: string }> {
  const user = await requireUser();
  const parsed = checkoutSchema.safeParse({ courseId: formData.get("courseId"), couponCode: formData.get("couponCode") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message, fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { courseId, couponCode } = parsed.data;

  if (!rateLimit(`checkout:${user.id}`, CHECKOUT_QUOTA).ok) {
    return { ok: false, message: "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, title: true, status: true, visibility: true, price: true, enrollPolicy: true },
  });
  if (!course || course.status !== CourseStatus.PUBLISHED) return { ok: false, message: "ไม่พบคอร์ส หรือคอร์สยังไม่เปิดขาย" };

  const offer = courseOffer(course, hasPayment);
  if (offer.kind === "free") return { ok: false, message: "คอร์สนี้เรียนฟรี ลงทะเบียนได้ที่หน้าคอร์ส" };
  if (offer.kind === "not-for-sale") return { ok: false, message: offer.reason };
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, message: "ยังไม่เปิดขายออนไลน์ กรุณากลับมาใหม่ภายหลัง" };

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { status: true, expiresAt: true },
  });
  if (
    enrollment &&
    (enrollment.status === EnrollmentStatus.ACTIVE || enrollment.status === EnrollmentStatus.COMPLETED) &&
    (enrollment.expiresAt === null || enrollment.expiresAt > new Date())
  ) {
    return { ok: false, message: "คุณมีสิทธิ์เรียนคอร์สนี้อยู่แล้ว" };
  }

  const previous = await db.order.findFirst({
    where: { userId: user.id, courseId, status: OrderStatus.PENDING },
    select: { id: true },
  });
  if (previous) {
    const settled = await settleOrder(previous.id);
    if (settled?.status === OrderStatus.PAID) {
      return { ok: true, message: "คำสั่งซื้อก่อนหน้าชำระเงินแล้ว", redirectUrl: `/orders/${previous.id}` };
    }
    await db.order.updateMany({
      where: { id: previous.id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED, failureReason: "เริ่มชำระเงินใหม่" },
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ORDER_TTL_MINUTES * 60_000);
  let created: { id: string; amount: string; discount: string; free: boolean };
  try {
    created = await db.$transaction(async (tx) => {
      let pricing = { subtotal: offer.price, discount: "0", amount: offer.price, couponId: null as string | null };
      if (couponCode) {
        const quote = await findCouponQuote(tx, couponCode, { courseId, subtotal: offer.price, lock: true });
        if (!quote.ok) throw new CouponRejected(quote.message);
        pricing = { subtotal: quote.subtotal, discount: quote.discount, amount: quote.amount, couponId: quote.couponId! };
      }
      const free = toSatang(pricing.amount) === 0;
      const order = await tx.order.create({
        data: {
          userId: user.id,
          courseId,
          ...pricing,
          couponCode: couponCode || null,
          ...(free ? { status: OrderStatus.PAID, method: "coupon", paidAt: now } : { provider: provider.name, expiresAt }),
        },
        select: { id: true },
      });
      if (free) {
        await grantPurchase(tx, { id: order.id, userId: user.id, courseId, couponId: pricing.couponId, amount: pricing.amount }, now);
      }
      return { id: order.id, amount: pricing.amount, discount: pricing.discount, free };
    });
  } catch (error) {
    if (error instanceof CouponRejected) return { ok: false, message: error.message, fieldErrors: { couponCode: error.message } };
    // สองแท็บกดพร้อมกัน — partial unique index (S2) ให้ผ่านได้คำสั่งซื้อเดียว
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "มีคำสั่งซื้อของคอร์สนี้กำลังดำเนินการอยู่ กรุณาลองใหม่อีกครั้ง" };
    }
    throw error;
  }
  const orderId = created.id;

  if (created.free) {
    await announcePaid(
      { id: orderId, userId: user.id, courseId, course: { title: course.title, slug: course.slug } },
      {
        actorId: user.id,
        after: {
          status: OrderStatus.PAID,
          method: "coupon",
          amount: created.amount,
          discount: created.discount,
          couponCode,
          supersedes: previous?.id ?? null,
        },
      },
    );
    return { ok: true, message: "ใช้คูปองสำเร็จ เริ่มเรียนได้ทันที", redirectUrl: `/orders/${orderId}` };
  }

  let redirectUrl: string;
  try {
    const session = await provider.createCheckout({
      orderId,
      amountSatang: toSatang(created.amount),
      description: course.title,
      customerEmail: user.email,
      returnUrl: `${env.NEXT_PUBLIC_APP_URL}/orders/${orderId}`,
      expiresAt,
    });
    await db.order.update({ where: { id: orderId }, data: { providerRef: session.providerRef } });
    redirectUrl = session.redirectUrl;
  } catch (error) {
    console.error("[commerce] สร้างหน้าชำระเงินไม่สำเร็จ", error);
    await db.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.FAILED, failureReason: "ติดต่อผู้ให้บริการชำระเงินไม่สำเร็จ" },
    });
    return { ok: false, message: "ติดต่อผู้ให้บริการชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  await writeAudit({
    actorId: user.id,
    action: "order.create",
    entity: "Order",
    entityId: orderId,
    after: {
      courseId,
      amount: created.amount,
      discount: created.discount,
      couponCode: couponCode || null,
      provider: provider.name,
      supersedes: previous?.id ?? null,
    },
  });
  return { ok: true, message: "กำลังไปหน้าชำระเงิน", redirectUrl };
}

/** หน้า `/orders/[id]` ถามผลซ้ำระหว่างรอ — ตัดสินจากผู้ให้บริการ ไม่ใช่จาก URL ที่ gateway ส่งกลับมา */
export async function checkOrderStatus(orderId: string): Promise<{ status: OrderStatus } | null> {
  const user = await requireUser();
  const parsed = orderIdSchema.safeParse({ orderId });
  if (!parsed.success) return null;
  const order = await db.order.findFirst({ where: { id: parsed.data.orderId, userId: user.id }, select: { status: true } });
  if (!order) return null;
  if (order.status !== OrderStatus.PENDING) return { status: order.status };
  const settled = await settleOrder(parsed.data.orderId);
  return { status: settled?.status ?? order.status };
}

/**
 * หน้าชำระเงินจำลอง — **เฉพาะ `PAYMENT_PROVIDER=mock`**
 * ทำตัวเหมือน gateway: เปลี่ยนสถานะ charge แล้วส่ง webhook ที่เซ็นแล้วเข้าทางเดียวกับของจริง (`handlePaymentWebhook`)
 */
export async function payWithMock(formData: FormData): Promise<ActionResult & { redirectUrl?: string }> {
  const user = await requireUser();
  if (env.PAYMENT_PROVIDER !== "mock" || !env.PAYMENT_WEBHOOK_SECRET) return { ok: false, message: "ไม่พบหน้านี้" };

  const parsed = mockPaySchema.safeParse({
    orderId: formData.get("orderId"),
    ref: formData.get("ref"),
    outcome: formData.get("outcome"),
    method: formData.get("method"),
  });
  if (!parsed.success) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

  const order = await db.order.findFirst({
    where: { id: parsed.data.orderId, userId: user.id, providerRef: parsed.data.ref },
    select: { id: true },
  });
  if (!order) return { ok: false, message: "ไม่พบคำสั่งซื้อ" };

  const hook = completeMockCharge(parsed.data.ref, parsed.data.outcome, parsed.data.method, env.PAYMENT_WEBHOOK_SECRET);
  if (!hook) return { ok: false, message: "รายการนี้ชำระไปแล้วหรือหมดอายุ", redirectUrl: `/orders/${order.id}` };

  const result = await handlePaymentWebhook("mock", hook.body, new Headers({ [MOCK_SIGNATURE_HEADER]: hook.signature }));
  if (result.status !== 200) return { ok: false, message: "ประมวลผลการชำระเงินไม่สำเร็จ" };
  return { ok: true, message: "ส่งผลการชำระเงินแล้ว", redirectUrl: `/orders/${order.id}` };
}

class CouponRejected extends Error {}

/**
 * FR-18.2 — หน้า checkout กด "ใช้คูปอง" เพื่อดูยอดก่อน · ไม่จองสิทธิ์ (จองตอนสร้างคำสั่งซื้อ)
 * ยอดที่เก็บเงินจริงคำนวณใหม่ใน `startCheckout()` เสมอ
 */
export async function previewCoupon(
  formData: FormData,
): Promise<ActionResult & { quote?: { subtotal: string; discount: string; amount: string } }> {
  const user = await requireUser();
  const parsed = checkoutSchema.safeParse({ courseId: formData.get("courseId"), couponCode: formData.get("couponCode") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message, fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { courseId, couponCode } = parsed.data;
  if (!couponCode) return { ok: false, message: "กรุณากรอกรหัสคูปอง", fieldErrors: { couponCode: "กรุณากรอกรหัสคูปอง" } };
  // กันเดารหัสคูปองรัว ๆ
  if (!rateLimit(`coupon:${user.id}`, COUPON_QUOTA).ok) {
    return { ok: false, message: "ลองรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { status: true, visibility: true, price: true, enrollPolicy: true },
  });
  if (!course || course.status !== CourseStatus.PUBLISHED) return { ok: false, message: "ไม่พบคอร์ส" };
  const offer = courseOffer(course, hasPayment);
  if (offer.kind !== "buy") return { ok: false, message: "คอร์สนี้ยังซื้อไม่ได้" };

  const quote = await findCouponQuote(db, couponCode, { courseId, subtotal: offer.price });
  if (!quote.ok) return { ok: false, message: quote.message, fieldErrors: { couponCode: quote.message } };
  return { ok: true, message: "ใช้คูปองได้", quote: { subtotal: quote.subtotal, discount: quote.discount, amount: quote.amount } };
}

/** FR-18.2 · Q3 — สร้างคูปอง (ผู้ดูแลระบบเท่านั้น) */
export async function createCoupon(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(Role.SUPER_ADMIN);
  const parsed = couponFormSchema.safeParse({
    code: formData.get("code"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    maxUses: formData.get("maxUses"),
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
    courseId: formData.get("courseId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลคูปอง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  if (data.courseId) {
    const course = await db.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
    if (!course) return { ok: false, message: "ไม่พบคอร์ส", fieldErrors: { courseId: "ไม่พบคอร์ส" } };
  }

  let couponId: string;
  try {
    const created = await db.coupon.create({ data: { ...data, createdById: user.id }, select: { id: true } });
    couponId = created.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "รหัสคูปองนี้มีอยู่แล้ว", fieldErrors: { code: "รหัสคูปองนี้มีอยู่แล้ว" } };
    }
    throw error;
  }

  await writeAudit({
    actorId: user.id,
    action: "coupon.create",
    entity: "Coupon",
    entityId: couponId,
    after: { ...data, validFrom: data.validFrom?.toISOString() ?? null, validUntil: data.validUntil?.toISOString() ?? null },
  });
  revalidatePath("/admin/coupons");
  return { ok: true, message: `สร้างคูปอง ${data.code} แล้ว` };
}

/** FR-18.2 — เปิด/ปิดใช้คูปอง · ไม่มีการลบ (คำสั่งซื้อเก่าอ้างถึงอยู่) · คำสั่งซื้อที่จองไว้แล้วยังจ่ายได้ตามยอดเดิม (Q7) */
export async function setCouponActive(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(Role.SUPER_ADMIN);
  const id = couponIdSchema.safeParse(formData.get("couponId"));
  if (!id.success) return { ok: false, message: "ไม่พบคูปอง" };
  const active = formData.get("active") === "true";

  const coupon = await db.coupon.findUnique({ where: { id: id.data }, select: { code: true, active: true } });
  if (!coupon) return { ok: false, message: "ไม่พบคูปอง" };
  if (coupon.active === active) return { ok: true, message: active ? "คูปองเปิดใช้อยู่แล้ว" : "คูปองปิดใช้อยู่แล้ว" };

  await db.coupon.update({ where: { id: id.data }, data: { active } });
  await writeAudit({
    actorId: user.id,
    action: active ? "coupon.activate" : "coupon.deactivate",
    entity: "Coupon",
    entityId: id.data,
    before: { code: coupon.code, active: coupon.active },
    after: { code: coupon.code, active },
  });
  revalidatePath("/admin/coupons");
  return { ok: true, message: active ? `เปิดใช้คูปอง ${coupon.code} แล้ว` : `ปิดใช้คูปอง ${coupon.code} แล้ว` };
}

/**
 * FR-18.2 · Q6 — คืนเงินเต็มจำนวน (ผู้ดูแลระบบเท่านั้น · `/admin/orders`)
 *
 * 1. ตรวจนโยบาย 7 วัน/20% (`checkRefund()`) — นอกนโยบายต้องยืนยัน · ทุกกรณีต้องมีเหตุผล
 * 2. จองคำขอด้วย `updateMany` ที่มีเงื่อนไข `refundReason = null` (กดซ้ำ/สองแท็บ → คืนครั้งเดียว) พร้อมบันทึกเหตุผล/ยอด
 * 3. เรียก refund ที่ผู้ให้บริการ — ล้ม = ปลดการจองให้ลองใหม่ได้
 * 4. `settleOrder()` ถามสถานะกลับ แล้วค่อยเปลี่ยนเป็น REFUNDED + ตัดสิทธิ์ + เพิกถอนใบประกาศ (webhook ที่ตามมาเข้าทางเดียวกัน)
 */
export async function refundOrder(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(Role.SUPER_ADMIN);
  const parsed = refundSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    override: formData.get("override"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message, fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { orderId, reason, override } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, courseId: true, status: true, amount: true, paidAt: true, provider: true, providerRef: true, refundReason: true },
  });
  if (!order) return { ok: false, message: "ไม่พบคำสั่งซื้อ" };
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
    select: { progressPct: true },
  });
  const check = checkRefund(order, enrollment?.progressPct ?? 0, new Date());
  if (check.kind === "blocked") return { ok: false, message: check.reason };
  if (check.kind === "override" && !override) {
    return { ok: false, message: `อยู่นอกนโยบายคืนเงิน: ${check.reasons.join(" · ")} — ติ๊กยืนยันเพื่อคืนเป็นกรณีพิเศษ` };
  }
  const provider = getPaymentProvider();
  if (!provider || provider.name !== order.provider) return { ok: false, message: "ผู้ให้บริการชำระเงินของรายการนี้ไม่ได้เปิดใช้อยู่" };

  const claimed = await db.order.updateMany({
    where: { id: order.id, status: OrderStatus.PAID, refundReason: null },
    data: { refundReason: reason, refundAmount: order.amount },
  });
  if (claimed.count === 0) return { ok: false, message: "รายการนี้กำลังคืนเงินหรือคืนไปแล้ว" };
  await writeAudit({
    actorId: user.id,
    action: "order.refund_request",
    entity: "Order",
    entityId: order.id,
    after: { amount: order.amount.toString(), reason, outsidePolicy: check.kind === "override" ? check.reasons : null },
  });

  try {
    await provider.refund(order.providerRef!, toSatang(order.amount));
  } catch (error) {
    console.error("[commerce] คืนเงินไม่สำเร็จ", error);
    await db.order.updateMany({
      where: { id: order.id, status: OrderStatus.PAID, refundReason: reason },
      data: { refundReason: null, refundAmount: null },
    });
    await writeAudit({ actorId: user.id, action: "order.refund_failed", entity: "Order", entityId: order.id, after: { reason } });
    return { ok: false, message: "ผู้ให้บริการปฏิเสธการคืนเงิน กรุณาตรวจสอบที่แดชบอร์ดของผู้ให้บริการแล้วลองใหม่" };
  }

  const settled = await settleOrder(order.id);
  revalidatePath("/admin/orders");
  return settled?.status === OrderStatus.REFUNDED
    ? { ok: true, message: "คืนเงินแล้ว — ตัดสิทธิ์เรียนและแจ้งผู้ซื้อแล้ว" }
    : { ok: true, message: "ส่งคำขอคืนเงินแล้ว — ระบบจะปรับสถานะเมื่อผู้ให้บริการยืนยัน" };
}

/** ผู้ดูแลกด "ตรวจสอบกับผู้ให้บริการ" — จ่ายแล้วแต่ webhook หาย / คืนเงินค้างยืนยัน (phase-4-plan §7) */
export async function recheckOrder(formData: FormData): Promise<ActionResult> {
  const user = await requireRole(Role.SUPER_ADMIN);
  const parsed = orderIdSchema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) return { ok: false, message: "ไม่พบคำสั่งซื้อ" };
  const before = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { status: true } });
  if (!before) return { ok: false, message: "ไม่พบคำสั่งซื้อ" };

  const settled = await settleOrder(parsed.data.orderId);
  await writeAudit({
    actorId: user.id,
    action: "order.recheck",
    entity: "Order",
    entityId: parsed.data.orderId,
    before: { status: before.status },
    after: { status: settled?.status ?? before.status },
  });
  revalidatePath("/admin/orders");
  return settled?.changed
    ? { ok: true, message: `อัปเดตสถานะเป็น “${ORDER_STATUS_LABEL[settled.status]}” แล้ว` }
    : { ok: true, message: "สถานะตรงกับผู้ให้บริการแล้ว ไม่มีอะไรเปลี่ยน" };
}
