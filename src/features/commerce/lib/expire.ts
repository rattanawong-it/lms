import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { OrderStatus } from "@/generated/prisma/enums";
import { settleOrder } from "@/features/commerce/lib/settle";

/** รอบละไม่เกินเท่านี้ — แต่ละรายการต้องถามผู้ให้บริการ 1 ครั้ง */
const BATCH = 100;

export type OrderExpiryResult = { checked: number; paid: number; expired: number };

/**
 * `/api/cron/orders` (ทุก 15 นาที) — ปิดคำสั่งซื้อ PENDING ที่หมดอายุ (phase-4-plan ขั้น 2 · §7)
 * ถามผลจากผู้ให้บริการก่อนทุกรายการ: จ่ายแล้วแต่ webhook หาย → เปิดสิทธิ์ · ยังไม่จ่าย → FAILED "หมดเวลาชำระเงิน"
 */
export async function runOrderExpiry(now: Date = new Date()): Promise<OrderExpiryResult> {
  const stale = await db.order.findMany({
    where: { status: OrderStatus.PENDING, expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  let paid = 0;
  let expired = 0;
  for (const { id } of stale) {
    const settled = await settleOrder(id);
    if (settled?.status === OrderStatus.PAID) {
      paid += 1;
      continue;
    }
    const closed = await db.order.updateMany({
      where: { id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED, failureReason: "หมดเวลาชำระเงิน" },
    });
    expired += closed.count;
  }

  if (paid + expired > 0) {
    await writeAudit({ actorId: null, action: "cron.orders", entity: "System", after: { checked: stale.length, paid, expired } });
  }
  return { checked: stale.length, paid, expired };
}
