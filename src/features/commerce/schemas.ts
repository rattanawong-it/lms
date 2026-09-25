import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";

/** M18 · FR-18.1 — คำสั่งซื้อ (ใช้ร่วม client/server) */

/** คำสั่งซื้อ PENDING หมดอายุหลัง 30 นาที (QR PromptPay · Q7 ล็อกยอด/คูปองไว้เท่านี้) */
export const ORDER_TTL_MINUTES = 30;

/** สร้างคำสั่งซื้อได้ไม่เกิน 10 ครั้ง/10 นาที ต่อผู้ใช้ — กันยิงสร้าง charge รัว ๆ ที่ gateway */
export const CHECKOUT_QUOTA = { windowSec: 10 * 60, max: 10 };

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

export const METHOD_LABEL: Record<string, string> = { card: "บัตรเครดิต/เดบิต", promptpay: "PromptPay" };

export const checkoutSchema = z.object({ courseId: z.cuid("ไม่พบคอร์ส") });

export const orderIdSchema = z.object({ orderId: z.cuid("ไม่พบคำสั่งซื้อ") });

/** หน้าชำระเงินจำลอง (dev/e2e) */
export const mockPaySchema = z.object({
  orderId: z.cuid("ไม่พบคำสั่งซื้อ"),
  ref: z.string().regex(/^mock_[0-9a-f]+$/, "ไม่พบรายการชำระเงิน"),
  outcome: z.enum(["paid", "failed"]),
  method: z.enum(["card", "promptpay"]),
});
