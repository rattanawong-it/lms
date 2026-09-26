import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getPaymentProvider, toSatang } from "@/lib/payment";
import { EnrollmentSource, EnrollmentStatus, NotificationType, OrderStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { issueReceipt } from "@/features/commerce/lib/receipt";

/**
 * M18 · FR-18.1 — ตัดสินผลการชำระของคำสั่งซื้อ **จากสถานะที่ถามผู้ให้บริการเอง** (ไม่เชื่อ webhook payload/หน้า return)
 *
 * เรียกได้จาก webhook, หน้า `/orders/[id]` (ถามซ้ำ) และ cron — จึงต้อง idempotent:
 * เปลี่ยนสถานะด้วย `updateMany` ที่มีเงื่อนไขสถานะเดิม (PENDING/FAILED → PAID) ครั้งเดียวเท่านั้นที่ได้ count = 1
 * แล้วเปิดสิทธิ์เรียนใน transaction เดียวกัน
 *
 * FAILED → PAID ยอมรับ: ผู้ซื้อจ่ายหลังเราปิดคำสั่งซื้อที่หมดอายุไปแล้ว — เงินเข้าแล้วต้องได้สิทธิ์
 * PAID → REFUNDED เมื่อผู้ให้บริการบอกว่า charge ถูกคืนแล้ว (`finalizeRefund()`)
 * ผู้เรียกต้องตรวจสิทธิ์ของผู้ขอมาก่อน (เจ้าของคำสั่งซื้อ/ผู้ดูแล/webhook ที่ผ่านลายเซ็น)
 */
export type SettleResult = { status: OrderStatus; changed: boolean };

export async function settleOrder(orderId: string): Promise<SettleResult | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      couponId: true,
      status: true,
      amount: true,
      provider: true,
      providerRef: true,
      course: { select: { title: true, slug: true } },
    },
  });
  if (!order) return null;
  if (!order.providerRef || order.status === OrderStatus.REFUNDED) return { status: order.status, changed: false };

  const provider = getPaymentProvider();
  if (!provider || provider.name !== order.provider) return { status: order.status, changed: false };

  const charge = await provider.retrieve(order.providerRef);
  if (!charge) return { status: order.status, changed: false };

  // PAID → REFUNDED ตัดสินจากสถานะที่ถามผู้ให้บริการเช่นกัน (คืนจากหน้า /admin/orders หรือจากแดชบอร์ดของผู้ให้บริการ)
  if (order.status === OrderStatus.PAID) {
    return charge.status === "refunded" && charge.orderId === order.id
      ? finalizeRefund(order)
      : { status: order.status, changed: false };
  }

  // ยอด/คำสั่งซื้อต้องตรงกับที่เราสร้าง — ไม่งั้นมีคนเอา charge อื่นมาสวม
  if (charge.orderId !== order.id || charge.amountSatang !== toSatang(order.amount)) {
    console.error("[commerce] charge ไม่ตรงกับคำสั่งซื้อ", { orderId, providerRef: order.providerRef });
    return { status: order.status, changed: false };
  }

  if (charge.status === "failed" && order.status === OrderStatus.PENDING) {
    const updated = await db.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED, failureReason: "ชำระเงินไม่สำเร็จ" },
    });
    if (updated.count === 1) {
      await writeAudit({ actorId: null, action: "order.failed", entity: "Order", entityId: order.id, after: { providerRef: order.providerRef } });
    }
    return { status: OrderStatus.FAILED, changed: updated.count === 1 };
  }

  if (charge.status !== "paid") return { status: order.status, changed: false };

  const paidAt = charge.paidAt ?? new Date();
  const enrollmentId = await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: { in: [OrderStatus.PENDING, OrderStatus.FAILED] } },
      data: { status: OrderStatus.PAID, paidAt, method: charge.method, failureReason: null },
    });
    if (updated.count === 0) return null;
    return grantPurchase(tx, order, paidAt);
  });

  if (!enrollmentId) {
    const now = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    return { status: now.status, changed: false };
  }

  await announcePaid(order, {
    before: { status: order.status },
    after: { status: OrderStatus.PAID, method: charge.method, amount: order.amount.toString(), enrollmentId },
  });
  return { status: OrderStatus.PAID, changed: true };
}

/**
 * ใน transaction เดียวกับที่คำสั่งซื้อกลายเป็น PAID — เปิดสิทธิ์เรียน (`PURCHASE`) นับการใช้คูปอง และออกเลขใบเสร็จ (ยอด > 0)
 * คูปองนับเพิ่มโดยไม่เช็คเพดานอีกรอบ: สิทธิ์ถูกจองไว้ตอนสร้างคำสั่งซื้อแล้ว (Q7) และเงินเข้าแล้วต้องได้สิทธิ์เรียนเสมอ
 * (กรณีจ่ายหลังคำสั่งซื้อหมดอายุ usedCount อาจเกิน maxUses ได้ 1 — ยอมรับ)
 */
export async function grantPurchase(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string; courseId: string; couponId: string | null; amount: { toString(): string } },
  paidAt: Date,
): Promise<string> {
  await issueReceipt(tx, order, paidAt);
  if (order.couponId) {
    await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
  }
  // มีแถวเดิม (ถอน/หมดอายุ/รออนุมัติ) เปิดใหม่โดยคงความคืบหน้า · ซื้อแล้วเรียนได้ตลอด (Q5)
  const enrollment = await tx.enrollment.upsert({
    where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
    create: { userId: order.userId, courseId: order.courseId, status: EnrollmentStatus.ACTIVE, source: EnrollmentSource.PURCHASE },
    update: { expiresAt: null },
    select: { id: true, status: true },
  });
  if (enrollment.status !== EnrollmentStatus.ACTIVE && enrollment.status !== EnrollmentStatus.COMPLETED) {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.ACTIVE, source: EnrollmentSource.PURCHASE, enrolledAt: new Date() },
    });
  }
  return enrollment.id;
}

/** หลัง commit — audit · แจ้งผู้ซื้อ · revalidate หน้าที่เกี่ยวข้อง */
export async function announcePaid(
  order: { id: string; userId: string; courseId: string; course: { title: string; slug: string } },
  audit: { actorId?: string | null; before?: Prisma.InputJsonValue; after: Prisma.InputJsonValue },
): Promise<void> {
  await writeAudit({ actorId: null, action: "order.paid", entity: "Order", entityId: order.id, ...audit });
  await notify({
    userIds: [order.userId],
    type: NotificationType.ENROLLED,
    title: `ชำระเงินสำเร็จ — เริ่มเรียน “${order.course.title}” ได้เลย`,
    // หน้าคำสั่งซื้อมีทั้งปุ่มเริ่มเรียนและดาวน์โหลดใบเสร็จ (อีเมลแจ้งเตือนใช้ลิงก์นี้)
    link: `/orders/${order.id}`,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${order.course.slug}`);
  revalidatePath(`/teach/courses/${order.courseId}/students`);
}

/**
 * FR-18.2 · Q6 — ปิดการคืนเงินหลังผู้ให้บริการยืนยันว่า charge ถูกคืนแล้ว (เรียกจาก `settleOrder()` เท่านั้น)
 * ทรานแซกชันเดียว: PAID → REFUNDED (idempotent ด้วยเงื่อนไขสถานะ) · สิทธิ์เรียนเป็น DROPPED · เพิกถอนใบประกาศของคอร์สนี้
 * ใบเสร็จเดิมคงไว้ (เอกสารทางบัญชี) · เหตุผล/ยอดที่ผู้ดูแลกรอกถูกบันทึกไว้ก่อนเรียกผู้ให้บริการ (`refundOrder()`)
 * คืนจากแดชบอร์ดของผู้ให้บริการโดยตรง (ไม่มีเหตุผลในระบบ) → ใส่เหตุผลกลางและยอดเต็ม
 */
async function finalizeRefund(order: {
  id: string;
  userId: string;
  courseId: string;
  amount: { toString(): string };
  course: { title: string; slug: string };
}): Promise<SettleResult> {
  const refundedAt = new Date();
  const result = await db.$transaction(async (tx) => {
    const current = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { refundReason: true, refundAmount: true },
    });
    const reason = current.refundReason ?? "คืนเงินผ่านผู้ให้บริการชำระเงิน";
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.PAID },
      data: {
        status: OrderStatus.REFUNDED,
        refundedAt,
        refundReason: reason,
        refundAmount: current.refundAmount ?? order.amount.toString(),
      },
    });
    if (updated.count === 0) return null;

    const dropped = await tx.enrollment.updateMany({
      where: { userId: order.userId, courseId: order.courseId },
      data: { status: EnrollmentStatus.DROPPED },
    });
    const revoked = await tx.certificate.updateMany({
      where: { userId: order.userId, courseId: order.courseId, revokedAt: null },
      data: { revokedAt: refundedAt, revokeReason: `คืนเงินค่าคอร์ส — ${reason}` },
    });
    return { reason, dropped: dropped.count, revoked: revoked.count };
  });
  if (!result) {
    const now = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    return { status: now.status, changed: false };
  }

  await writeAudit({
    actorId: null,
    action: "order.refunded",
    entity: "Order",
    entityId: order.id,
    before: { status: OrderStatus.PAID },
    after: { status: OrderStatus.REFUNDED, reason: result.reason, enrollmentDropped: result.dropped, certificatesRevoked: result.revoked },
  });
  await notify({
    userIds: [order.userId],
    type: NotificationType.ENROLLED,
    title: `คืนเงินค่าคอร์ส “${order.course.title}” แล้ว`,
    body: "สิทธิ์เรียนคอร์สนี้สิ้นสุดลง · เงินจะเข้าบัญชีตามรอบของธนาคาร/ผู้ออกบัตร",
    link: `/orders/${order.id}`,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath("/certificates");
  revalidatePath(`/courses/${order.course.slug}`);
  revalidatePath(`/teach/courses/${order.courseId}/students`);
  return { status: OrderStatus.REFUNDED, changed: true };
}
