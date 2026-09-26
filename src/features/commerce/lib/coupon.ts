import { fromSatang, toSatang } from "@/lib/payment/money";

/**
 * M18 · FR-18.2 — กติกาคูปองส่วนลด (pure · ใช้ทั้งหน้า checkout, action และ unit test)
 *
 * คิดเป็นสตางค์ทั้งหมด · ส่วนลดเปอร์เซ็นต์ปัดครึ่งขึ้นเป็นสตางค์ · ยอดหลังลดต่ำสุด 0
 * สิทธิ์คงเหลือนับ `usedCount` + คำสั่งซื้อ PENDING ที่ยังไม่หมดอายุ (Q7 จองสิทธิ์ไว้เท่าอายุคำสั่งซื้อ)
 */

type DecimalLike = { toString(): string };

export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** รหัสคูปองเก็บ/เทียบเป็นตัวพิมพ์ใหญ่เสมอ · ตัดช่องว่าง */
export function normalizeCouponCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

export type CouponRule = {
  percentOff: number | null;
  amountOff: DecimalLike | string | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
  courseId: string | null;
};

export type CouponQuote =
  | { ok: true; subtotal: string; discount: string; amount: string }
  | { ok: false; message: string };

/** ส่วนลดเป็นสตางค์ (ไม่เกินยอดก่อนลด) */
export function discountSatang(rule: Pick<CouponRule, "percentOff" | "amountOff">, subtotalSatang: number): number {
  const raw =
    rule.percentOff !== null
      ? Math.floor((subtotalSatang * rule.percentOff + 50) / 100)
      : rule.amountOff !== null
        ? toSatang(rule.amountOff)
        : 0;
  return Math.min(raw, subtotalSatang);
}

/**
 * ใช้คูปองกับคอร์สนี้ได้ไหม และยอดเท่าไร — ข้อความไทยสำหรับแสดงผู้ซื้อ
 * `reserved` = คำสั่งซื้อ PENDING ที่ยังไม่หมดอายุซึ่งจองคูปองนี้อยู่ (ไม่นับคำสั่งซื้อที่กำลังจะถูกแทนที่ของผู้ซื้อเอง)
 */
export function quoteCoupon(
  rule: CouponRule | null,
  ctx: { courseId: string; subtotal: DecimalLike | string; now: Date; reserved: number },
): CouponQuote {
  if (!rule || !rule.active) return { ok: false, message: "ไม่พบรหัสคูปองนี้ หรือคูปองถูกปิดใช้แล้ว" };
  if (rule.courseId !== null && rule.courseId !== ctx.courseId) return { ok: false, message: "คูปองนี้ใช้กับคอร์สนี้ไม่ได้" };
  if (rule.validFrom && ctx.now < rule.validFrom) return { ok: false, message: "คูปองนี้ยังไม่ถึงวันเริ่มใช้" };
  if (rule.validUntil && ctx.now > rule.validUntil) return { ok: false, message: "คูปองนี้หมดอายุแล้ว" };
  if (rule.maxUses !== null && rule.usedCount + ctx.reserved >= rule.maxUses) {
    return { ok: false, message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" };
  }
  const subtotal = toSatang(ctx.subtotal);
  const discount = discountSatang(rule, subtotal);
  return { ok: true, subtotal: fromSatang(subtotal), discount: fromSatang(discount), amount: fromSatang(subtotal - discount) };
}
