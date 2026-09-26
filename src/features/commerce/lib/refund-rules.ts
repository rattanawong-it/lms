import { OrderStatus } from "@/generated/prisma/enums";
import { toSatang } from "@/lib/payment/money";

/**
 * M18 · FR-18.2 · Q6 — คืนเงินได้ไหม (pure · ใช้ทั้งหน้า `/admin/orders` และ action)
 *
 * ตามนโยบาย: คืนเต็มจำนวนภายใน 7 วันหลังชำระ และเรียนไปไม่เกิน 20% · ไม่มีคืนบางส่วนในเฟสนี้
 * นอกนโยบาย ผู้ดูแลคืนได้ถ้ายืนยัน (`override`) — ทุกกรณีต้องมีเหตุผล
 * คืนไม่ได้เลย: ยังไม่ชำระ/คืนไปแล้ว · ยอด 0 บาท (คูปอง 100% ไม่มีเงินให้คืน) · ไม่ได้จ่ายผ่านผู้ให้บริการ
 */

export const REFUND_WINDOW_DAYS = 7;
export const REFUND_MAX_PROGRESS = 20;

type DecimalLike = { toString(): string };

export type RefundCheck =
  /** คืนไม่ได้ไม่ว่ากรณีใด */
  | { kind: "blocked"; reason: string }
  /** ตามนโยบาย */
  | { kind: "allowed" }
  /** นอกนโยบาย — ต้องยืนยันคืนเป็นกรณีพิเศษ */
  | { kind: "override"; reasons: string[] };

export function checkRefund(
  order: { status: OrderStatus; amount: DecimalLike; paidAt: Date | null; providerRef: string | null },
  progressPct: number,
  now: Date,
): RefundCheck {
  if (order.status === OrderStatus.REFUNDED) return { kind: "blocked", reason: "คืนเงินรายการนี้ไปแล้ว" };
  if (order.status !== OrderStatus.PAID || !order.paidAt) return { kind: "blocked", reason: "คืนเงินได้เฉพาะรายการที่ชำระแล้ว" };
  if (toSatang(order.amount) === 0) return { kind: "blocked", reason: "รายการนี้ไม่มียอดชำระ (ใช้คูปองเต็มจำนวน)" };
  if (!order.providerRef) return { kind: "blocked", reason: "รายการนี้ไม่ได้ชำระผ่านผู้ให้บริการ" };

  const reasons: string[] = [];
  const days = (now.getTime() - order.paidAt.getTime()) / 86_400_000;
  if (days > REFUND_WINDOW_DAYS) reasons.push(`ชำระมาแล้วเกิน ${REFUND_WINDOW_DAYS} วัน`);
  if (progressPct > REFUND_MAX_PROGRESS) reasons.push(`เรียนไปแล้ว ${progressPct}% (เกิน ${REFUND_MAX_PROGRESS}%)`);
  return reasons.length === 0 ? { kind: "allowed" } : { kind: "override", reasons };
}
