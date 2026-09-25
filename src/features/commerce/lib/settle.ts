import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getPaymentProvider, toSatang } from "@/lib/payment";
import { EnrollmentSource, EnrollmentStatus, NotificationType, OrderStatus } from "@/generated/prisma/enums";

/**
 * M18 · FR-18.1 — ตัดสินผลการชำระของคำสั่งซื้อ **จากสถานะที่ถามผู้ให้บริการเอง** (ไม่เชื่อ webhook payload/หน้า return)
 *
 * เรียกได้จาก webhook, หน้า `/orders/[id]` (ถามซ้ำ) และ cron — จึงต้อง idempotent:
 * เปลี่ยนสถานะด้วย `updateMany` ที่มีเงื่อนไขสถานะเดิม (PENDING/FAILED → PAID) ครั้งเดียวเท่านั้นที่ได้ count = 1
 * แล้วเปิดสิทธิ์เรียนใน transaction เดียวกัน
 *
 * FAILED → PAID ยอมรับ: ผู้ซื้อจ่ายหลังเราปิดคำสั่งซื้อที่หมดอายุไปแล้ว — เงินเข้าแล้วต้องได้สิทธิ์
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
      status: true,
      amount: true,
      provider: true,
      providerRef: true,
      course: { select: { title: true, slug: true } },
    },
  });
  if (!order) return null;
  if (!order.providerRef || (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.FAILED)) {
    return { status: order.status, changed: false };
  }

  const provider = getPaymentProvider();
  if (!provider || provider.name !== order.provider) return { status: order.status, changed: false };

  const charge = await provider.retrieve(order.providerRef);
  if (!charge) return { status: order.status, changed: false };

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

    // เปิดสิทธิ์เรียน — มีแถวเดิม (ถอน/หมดอายุ/รออนุมัติ) เปิดใหม่โดยคงความคืบหน้า · ซื้อแล้วเรียนได้ตลอด (Q5)
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
  });

  if (!enrollmentId) {
    const now = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    return { status: now.status, changed: false };
  }

  await writeAudit({
    actorId: null,
    action: "order.paid",
    entity: "Order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: OrderStatus.PAID, method: charge.method, amount: order.amount.toString(), enrollmentId },
  });
  await notify({
    userIds: [order.userId],
    type: NotificationType.ENROLLED,
    title: `ชำระเงินสำเร็จ — เริ่มเรียน “${order.course.title}” ได้เลย`,
    link: `/learn/${order.courseId}`,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${order.course.slug}`);
  revalidatePath(`/teach/courses/${order.courseId}/students`);
  return { status: OrderStatus.PAID, changed: true };
}
