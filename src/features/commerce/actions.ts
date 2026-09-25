"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { env, hasPayment } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { getPaymentProvider, toSatang } from "@/lib/payment";
import { MOCK_SIGNATURE_HEADER, completeMockCharge } from "@/lib/payment/providers/mock";
import type { ActionResult } from "@/lib/action-result";
import { CourseStatus, EnrollmentStatus, OrderStatus } from "@/generated/prisma/enums";
import { CHECKOUT_QUOTA, ORDER_TTL_MINUTES, checkoutSchema, mockPaySchema, orderIdSchema } from "@/features/commerce/schemas";
import { courseOffer } from "@/features/commerce/lib/pricing";
import { settleOrder } from "@/features/commerce/lib/settle";
import { handlePaymentWebhook } from "@/features/commerce/lib/webhook";

/**
 * M18 · FR-18.1 — เริ่มชำระเงิน
 *
 * ราคามาจาก DB ตอนนี้เสมอ (ไม่รับยอดจาก client) · สร้าง `Order` PENDING อายุ 30 นาทีแล้วขอหน้าชำระจากผู้ให้บริการ
 * คำสั่งซื้อ PENDING เดิมของคอร์สเดียวกัน: ถามผลก่อน (อาจจ่ายไปแล้วแต่ webhook ยังไม่มา) ถ้ายังไม่จ่ายปิดเป็น FAILED แล้วสร้างใหม่
 * — charge เก่ายังผูกกับคำสั่งซื้อเดิม ถ้าผู้ซื้อจ่ายตามมาภายหลัง webhook ก็ยังเปิดสิทธิ์ให้ได้ (FAILED → PAID)
 */
export async function startCheckout(formData: FormData): Promise<ActionResult & { redirectUrl?: string }> {
  const user = await requireUser();
  const parsed = checkoutSchema.safeParse({ courseId: formData.get("courseId") });
  if (!parsed.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { courseId } = parsed.data;

  if (!rateLimit(`checkout:${user.id}`, CHECKOUT_QUOTA).ok) {
    return { ok: false, message: "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, visibility: true, price: true, enrollPolicy: true },
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

  const expiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60_000);
  let orderId: string;
  try {
    const created = await db.order.create({
      data: {
        userId: user.id,
        courseId,
        subtotal: offer.price,
        discount: "0",
        amount: offer.price,
        provider: provider.name,
        expiresAt,
      },
      select: { id: true },
    });
    orderId = created.id;
  } catch (error) {
    // สองแท็บกดพร้อมกัน — partial unique index (S2) ให้ผ่านได้คำสั่งซื้อเดียว
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "มีคำสั่งซื้อของคอร์สนี้กำลังดำเนินการอยู่ กรุณาลองใหม่อีกครั้ง" };
    }
    throw error;
  }

  let redirectUrl: string;
  try {
    const session = await provider.createCheckout({
      orderId,
      amountSatang: toSatang(offer.price),
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
    after: { courseId, amount: offer.price, provider: provider.name, supersedes: previous?.id ?? null },
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
