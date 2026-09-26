import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { bangkokDateTime } from "@/features/quiz/schemas";
import { fromSatang, toSatang } from "@/lib/payment/money";
import { COUPON_CODE_PATTERN, normalizeCouponCode } from "@/features/commerce/lib/coupon";
import { MAX_PRICE_SATANG } from "@/features/commerce/lib/pricing";

/** M18 · FR-18.1 — คำสั่งซื้อ (ใช้ร่วม client/server) */

/** คำสั่งซื้อ PENDING หมดอายุหลัง 30 นาที (QR PromptPay · Q7 ล็อกยอด/คูปองไว้เท่านี้) */
export const ORDER_TTL_MINUTES = 30;

/** สร้างคำสั่งซื้อได้ไม่เกิน 10 ครั้ง/10 นาที ต่อผู้ใช้ — กันยิงสร้าง charge รัว ๆ ที่ gateway */
export const CHECKOUT_QUOTA = { windowSec: 10 * 60, max: 10 };

/** ลองรหัสคูปองได้ไม่เกิน 20 ครั้ง/10 นาที ต่อผู้ใช้ — กันเดารหัส */
export const COUPON_QUOTA = { windowSec: 10 * 60, max: 20 };

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "รอชำระเงิน",
  [OrderStatus.PAID]: "ชำระแล้ว",
  [OrderStatus.FAILED]: "ไม่สำเร็จ/หมดอายุ",
  [OrderStatus.REFUNDED]: "คืนเงินแล้ว",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "bg-warning-bg text-warning-fg",
  [OrderStatus.PAID]: "bg-success-bg text-success-fg",
  [OrderStatus.FAILED]: "bg-muted text-fg-3",
  [OrderStatus.REFUNDED]: "bg-danger-bg text-danger-fg",
};

export const METHOD_LABEL: Record<string, string> = { card: "บัตรเครดิต/เดบิต", promptpay: "PromptPay", coupon: "คูปองส่วนลด 100%" };

/** รหัสคูปองจากช่องกรอก · ว่าง = ไม่ใช้คูปอง (ตัวพิมพ์เล็ก/ใหญ่ไม่ต่างกัน) */
export const couponCodeInput = z
  .unknown()
  .transform(normalizeCouponCode)
  .refine((v) => v === "" || COUPON_CODE_PATTERN.test(v), "รหัสคูปองไม่ถูกต้อง");

export const checkoutSchema = z.object({ courseId: z.cuid("ไม่พบคอร์ส"), couponCode: couponCodeInput });

/** FR-18.2 — สร้างคูปอง (`/admin/coupons`) */
export const couponFormSchema = z
  .object({
    code: z
      .unknown()
      .transform(normalizeCouponCode)
      .refine((v) => COUPON_CODE_PATTERN.test(v), "รหัสคูปองใช้ A–Z, 0–9, - หรือ _ ยาว 3–32 ตัว"),
    kind: z.enum(["percent", "amount"], "เลือกชนิดส่วนลด"),
    value: z.string().trim().min(1, "กรุณากรอกมูลค่าส่วนลด"),
    maxUses: z
      .string()
      .nullish()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 1_000_000), "จำนวนครั้งต้องเป็นจำนวนเต็ม 1 ขึ้นไป"),
    validFrom: bangkokDateTime,
    validUntil: bangkokDateTime,
    courseId: z.union([z.literal(""), z.cuid("ไม่พบคอร์ส")]).nullish().transform((v) => v || null),
  })
  .transform((v, ctx) => {
    let percentOff: number | null = null;
    let amountOff: string | null = null;
    if (v.kind === "percent") {
      const n = Number(v.value);
      if (!/^\d+$/.test(v.value) || n < 1 || n > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "เปอร์เซ็นต์ต้องเป็นจำนวนเต็ม 1–100" });
        return z.NEVER;
      }
      percentOff = n;
    } else {
      let satang: number;
      try {
        satang = toSatang(v.value.replace(/,/g, ""));
      } catch {
        ctx.addIssue({ code: "custom", path: ["value"], message: "ส่วนลดต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง" });
        return z.NEVER;
      }
      if (satang < 100 || satang > MAX_PRICE_SATANG) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "ส่วนลดต้องอยู่ระหว่าง 1–100,000 บาท" });
        return z.NEVER;
      }
      amountOff = fromSatang(satang);
    }
    if (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) {
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "วันหมดอายุต้องหลังวันเริ่มใช้" });
      return z.NEVER;
    }
    return { code: v.code, percentOff, amountOff, maxUses: v.maxUses, validFrom: v.validFrom, validUntil: v.validUntil, courseId: v.courseId };
  });

export const couponIdSchema = z.cuid("ไม่พบคูปอง");

export const orderIdSchema = z.object({ orderId: z.cuid("ไม่พบคำสั่งซื้อ") });

/** หน้าชำระเงินจำลอง (dev/e2e) */
export const mockPaySchema = z.object({
  orderId: z.cuid("ไม่พบคำสั่งซื้อ"),
  ref: z.string().regex(/^mock_[0-9a-f]+$/, "ไม่พบรายการชำระเงิน"),
  outcome: z.enum(["paid", "failed"]),
  method: z.enum(["card", "promptpay"]),
});
