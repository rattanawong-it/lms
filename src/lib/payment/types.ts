/**
 * M18 · FR-18.1 — สัญญาของผู้ให้บริการชำระเงิน (phase-4-plan ขั้น 0)
 *
 * ฟีเจอร์รู้จักแค่ interface นี้ · สลับ Omise/Stripe/ธนาคารได้ด้วย env `PAYMENT_PROVIDER` (D-05)
 * กติกาที่ทุก provider ต้องทำตาม:
 * - ยอดเงินเป็นสตางค์จำนวนเต็ม (`lib/payment/money.ts`)
 * - ผลการชำระ**ตัดสินที่ webhook + `retrieve()` เท่านั้น** — หน้าที่ gateway ส่งกลับมาไม่มีผลต่อสถานะ
 * - ไม่มีข้อมูลบัตรผ่านเซิร์ฟเวอร์ของเรา (หน้าชำระของผู้ให้บริการรับเอง)
 */

export type PaymentMethod = "card" | "promptpay";

export type CheckoutInput = {
  /** `Order.id` — ผู้ให้บริการเก็บไว้เป็น metadata เพื่ออ้างกลับ */
  orderId: string;
  amountSatang: number;
  description: string;
  customerEmail: string;
  /** URL เต็มที่ผู้ซื้อกลับมาหลังจ่าย — แสดง "กำลังตรวจสอบ" เท่านั้น */
  returnUrl: string;
  expiresAt: Date;
};

export type CheckoutSession = {
  /** รหัสการชำระฝั่งผู้ให้บริการ → `Order.providerRef` */
  providerRef: string;
  /** ส่งผู้ซื้อไปที่นี่ */
  redirectUrl: string;
};

export type ChargeStatus = "pending" | "paid" | "failed" | "refunded";

export type ProviderCharge = {
  providerRef: string;
  orderId: string | null;
  status: ChargeStatus;
  amountSatang: number;
  method: PaymentMethod | null;
  paidAt: Date | null;
};

/** เหตุการณ์จาก webhook ที่ผ่านการตรวจลายเซ็นแล้ว — ยังต้อง `retrieve()` ซ้ำก่อนเชื่อสถานะ */
export type WebhookEvent = {
  /** กันประมวลผลซ้ำ → `PaymentEvent.eventId` */
  eventId: string;
  type: string;
  providerRef: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** สถานะล่าสุดจากผู้ให้บริการ · ไม่พบ = null */
  retrieve(providerRef: string): Promise<ProviderCharge | null>;
  refund(providerRef: string, amountSatang: number): Promise<{ refundRef: string }>;
  /** ลายเซ็นไม่ถูกต้อง/รูปแบบผิด = null — ผู้เรียกตอบ 400 */
  verifyWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
}
