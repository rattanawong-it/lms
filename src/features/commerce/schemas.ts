import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { bangkokDateTime } from "@/features/quiz/schemas";
import { fromSatang, toSatang } from "@/lib/payment/money";
import { COUPON_CODE_PATTERN, normalizeCouponCode } from "@/features/commerce/lib/coupon";
import { MAX_PRICE_SATANG } from "@/features/commerce/lib/pricing";

/** M18 · FR-18.1 — คำสั่งซื้อ (ใช้ร่วม client/server) */

/** คำสั่งซื้อ PENDING หมดอายุหลัง 30 นาที (QR PromptPay · Q7 ล็อกยอด/คูปองไว้เท่านี้) */
export const ORDER_TTL_MINUTES = 30;

/**
 * สร้างคำสั่งซื้อได้ไม่เกิน 30 ครั้ง/10 นาที ต่อผู้ใช้ — กันยิงสร้าง charge รัว ๆ ที่ gateway
 * (e2e ทุกไฟล์ซื้อด้วยบัญชีผู้เรียนเดียวกันทั้ง desktop/mobile — 10 ครั้งไม่พอตั้งแต่ขั้น 4)
 */
export const CHECKOUT_QUOTA = { windowSec: 10 * 60, max: 30 };

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

/** FR-18.2 · Q6 — คืนเงิน (`/admin/orders`) · `override` = ยืนยันคืนนอกนโยบาย 7 วัน/20% */
export const refundSchema = z.object({
  orderId: z.cuid("ไม่พบคำสั่งซื้อ"),
  reason: z
    .string({ error: "กรุณาระบุเหตุผลการคืนเงิน" })
    .trim()
    .min(5, "เหตุผลต้องยาวอย่างน้อย 5 ตัวอักษร")
    .max(500, "เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร"),
  override: z
    .union([z.literal("on"), z.literal("true")])
    .nullish()
    .transform((v) => v != null),
});

/** ตัวกรอง `/admin/orders` */
export const ORDER_FILTER_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;

export const orderIdSchema = z.object({ orderId: z.cuid("ไม่พบคำสั่งซื้อ") });

/** หน้าชำระเงินจำลอง (dev/e2e) */
export const mockPaySchema = z.object({
  orderId: z.cuid("ไม่พบคำสั่งซื้อ"),
  ref: z.string().regex(/^mock_[0-9a-f]+$/, "ไม่พบรายการชำระเงิน"),
  outcome: z.enum(["paid", "failed"]),
  method: z.enum(["card", "promptpay"]),
});

export type OrderFilter = {
  /** อีเมล/ชื่อผู้ซื้อ · เลขคำสั่งซื้อ · เลขใบเสร็จ · ชื่อคอร์ส */
  q: string;
  status: (typeof ORDER_FILTER_STATUSES)[number] | null;
  /** "YYYY-MM-DD" ตามเวลาไทย (วันที่สร้างคำสั่งซื้อ) */
  from: string | null;
  to: string | null;
  page: number;
};

export const ORDER_PAGE_SIZE = 50;

export function parseOrderFilter(input: Record<string, string | string[] | undefined>): OrderFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const status = one(input.status);
  const page = Number.parseInt(one(input.page) || "1", 10);
  return {
    q: one(input.q).trim().slice(0, 100),
    status: (ORDER_FILTER_STATUSES as readonly string[]).includes(status) ? (status as OrderFilter["status"]) : null,
    from: date(one(input.from)),
    to: date(one(input.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function orderQuery(filter: OrderFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (filter.q) out.q = filter.q;
  if (filter.status) out.status = filter.status;
  if (filter.from) out.from = filter.from;
  if (filter.to) out.to = filter.to;
  return out;
}
