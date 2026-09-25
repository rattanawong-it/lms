import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  ChargeStatus,
  CheckoutInput,
  PaymentMethod,
  PaymentProvider,
  ProviderCharge,
  WebhookEvent,
} from "@/lib/payment/types";

/**
 * M18 — ผู้ให้บริการจำลอง (dev/e2e เท่านั้น · env ห้ามใช้ใน production)
 *
 * ทำงานเหมือน gateway จริงทุกขั้นเพื่อให้ทางเดินของโค้ดเดียวกัน:
 * สร้าง checkout → ส่งไปหน้าจำลอง `/checkout/mock/[orderId]` → ผู้ซื้อกด "จ่ายสำเร็จ/ไม่สำเร็จ"
 * → หน้าจำลองยิง webhook ที่เซ็นด้วย `PAYMENT_WEBHOOK_SECRET` มาที่ `/api/payment/webhook/mock` → `retrieve()` ยืนยัน
 *
 * สถานะเก็บในหน่วยความจำของ process (อยู่รอด HMR ผ่าน globalThis) — รีสตาร์ตเซิร์ฟเวอร์แล้วคำสั่งซื้อค้างจะกลายเป็น "ไม่พบ"
 */

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

type MockCharge = ProviderCharge & { expiresAt: Date };

const store: Map<string, MockCharge> = ((globalThis as { __mockPayments?: Map<string, MockCharge> }).__mockPayments ??=
  new Map());

export function signMockBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** body ของ webhook จำลอง — รูปแบบคล้ายของจริง { id, type, data: { ref } } */
export type MockWebhookBody = { id: string; type: string; data: { ref: string } };

/**
 * จำลองผลการจ่ายจากหน้า `/checkout/mock` · คืน body + ลายเซ็นให้ผู้เรียกยิงเข้า webhook ของระบบ
 * คำสั่งซื้อที่หมดอายุแล้วจ่ายไม่ได้ (เหมือน QR PromptPay หมดอายุ)
 */
export function completeMockCharge(
  providerRef: string,
  outcome: "paid" | "failed",
  method: PaymentMethod,
  secret: string,
): { body: string; signature: string } | null {
  const charge = store.get(providerRef);
  if (!charge || charge.status !== "pending") return null;
  const expired = charge.expiresAt.getTime() <= Date.now();
  const status: ChargeStatus = outcome === "paid" && !expired ? "paid" : "failed";
  store.set(providerRef, { ...charge, status, method, paidAt: status === "paid" ? new Date() : null });
  const body = JSON.stringify({
    id: `evt_${randomBytes(8).toString("hex")}`,
    type: status === "paid" ? "charge.complete" : "charge.failed",
    data: { ref: providerRef },
  } satisfies MockWebhookBody);
  return { body, signature: signMockBody(body, secret) };
}

export function createMockProvider(webhookSecret: string, appUrl: string): PaymentProvider {
  return {
    name: "mock",

    async createCheckout(input: CheckoutInput) {
      const providerRef = `mock_${randomBytes(10).toString("hex")}`;
      store.set(providerRef, {
        providerRef,
        orderId: input.orderId,
        status: "pending",
        amountSatang: input.amountSatang,
        method: null,
        paidAt: null,
        expiresAt: input.expiresAt,
      });
      const url = new URL(`/checkout/mock/${input.orderId}`, appUrl);
      url.searchParams.set("ref", providerRef);
      return { providerRef, redirectUrl: url.toString() };
    },

    async retrieve(providerRef: string) {
      const charge = store.get(providerRef);
      if (!charge) return null;
      return {
        providerRef: charge.providerRef,
        orderId: charge.orderId,
        status: charge.status,
        amountSatang: charge.amountSatang,
        method: charge.method,
        paidAt: charge.paidAt,
      };
    },

    async refund(providerRef: string, amountSatang: number) {
      const charge = store.get(providerRef);
      if (!charge || charge.status !== "paid") throw new Error("คืนเงินได้เฉพาะรายการที่ชำระแล้ว");
      if (amountSatang !== charge.amountSatang) throw new Error("เฟสนี้คืนเงินได้เฉพาะเต็มจำนวน");
      store.set(providerRef, { ...charge, status: "refunded" });
      return { refundRef: `rfnd_${randomBytes(8).toString("hex")}` };
    },

    verifyWebhook(rawBody: string, headers: Headers): WebhookEvent | null {
      const given = headers.get(MOCK_SIGNATURE_HEADER);
      if (!given) return null;
      const expected = Buffer.from(signMockBody(rawBody, webhookSecret));
      const actual = Buffer.from(given);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      try {
        const body = JSON.parse(rawBody) as Partial<MockWebhookBody>;
        if (typeof body.id !== "string" || typeof body.type !== "string" || typeof body.data?.ref !== "string") return null;
        return { eventId: body.id, type: body.type, providerRef: body.data.ref };
      } catch {
        return null;
      }
    },
  };
}
