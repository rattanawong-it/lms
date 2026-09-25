import "server-only";
import { env, hasPayment } from "@/lib/env";
import { createMockProvider } from "@/lib/payment/providers/mock";
import type { PaymentProvider } from "@/lib/payment/types";

/**
 * M18 · D-05 — จุดเดียวที่รู้จักผู้ให้บริการชำระเงิน (เหมือน `storage.ts` รู้จัก S3)
 * ไม่ได้ตั้งค่า = null → ฟีเจอร์แสดง "ยังไม่เปิดขาย" แทนการ throw
 * Opn Payments (Omise) ตามมาในขั้น 2 (phase-4-plan)
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (!hasPayment) return null;
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return createMockProvider(env.PAYMENT_WEBHOOK_SECRET!, env.NEXT_PUBLIC_APP_URL);
    default:
      return null;
  }
}

export type * from "@/lib/payment/types";
export { formatBaht, fromSatang, toSatang } from "@/lib/payment/money";
