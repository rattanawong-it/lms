import { describe, expect, it } from "vitest";
import { formatBaht, fromSatang, toSatang } from "@/lib/payment/money";
import { mockPaymentForbidden } from "@/lib/payment/guard";
import { MOCK_SIGNATURE_HEADER, completeMockCharge, createMockProvider, signMockBody } from "@/lib/payment/providers/mock";

const SECRET = "mock-webhook-secret-123";
const provider = createMockProvider(SECRET, "http://localhost:3000");

const checkout = (orderId: string, minutes = 30, amountSatang = 99_000) =>
  provider.createCheckout({
    orderId,
    amountSatang,
    description: "คอร์สทดสอบ",
    customerEmail: "a@example.com",
    returnUrl: `http://localhost:3000/orders/${orderId}`,
    expiresAt: new Date(Date.now() + minutes * 60_000),
  });

describe("เงินบาท ↔ สตางค์ (M18)", () => {
  it("แปลงตรงตัวไม่ผ่าน float", () => {
    expect(toSatang("19.99")).toBe(1999);
    expect(toSatang("990")).toBe(99_000);
    expect(toSatang("0.5")).toBe(50);
    expect(toSatang({ toString: () => "1234.50" })).toBe(123_450);
    expect(toSatang(19.99)).toBe(1999);
  });

  it("ค่าติดลบ ทศนิยมเกิน 2 ตำแหน่ง หรือไม่ใช่ตัวเลข → throw", () => {
    expect(() => toSatang("-1")).toThrow();
    expect(() => toSatang("1.999")).toThrow();
    expect(() => toSatang("abc")).toThrow();
  });

  it("กลับเป็นสตริงบาท 2 ตำแหน่ง", () => {
    expect(fromSatang(1999)).toBe("19.99");
    expect(fromSatang(5)).toBe("0.05");
    expect(fromSatang(0)).toBe("0.00");
    expect(() => fromSatang(-1)).toThrow();
    expect(() => fromSatang(1.5)).toThrow();
  });

  it("แสดงผลแบบไทย · ลงตัวไม่มีทศนิยม", () => {
    expect(formatBaht("990")).toBe("฿990");
    expect(formatBaht("1234.5")).toBe("฿1,234.50");
  });
});

describe("mockPaymentForbidden (กัน mock หลุดไป production)", () => {
  it("production + mock = ห้าม เว้นแต่ตั้ง ALLOW_MOCK_PAYMENT=true", () => {
    expect(mockPaymentForbidden({ PAYMENT_PROVIDER: "mock", NODE_ENV: "production" })).toBe(true);
    expect(mockPaymentForbidden({ PAYMENT_PROVIDER: "mock", NODE_ENV: "production", ALLOW_MOCK_PAYMENT: "true" })).toBe(false);
    expect(mockPaymentForbidden({ PAYMENT_PROVIDER: "mock", NODE_ENV: "development" })).toBe(false);
    expect(mockPaymentForbidden({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("ผู้ให้บริการจำลอง", () => {
  it("สร้าง checkout → ส่งไปหน้าจำลองพร้อม ref · สถานะเริ่มเป็น pending", async () => {
    const session = await checkout("order1");
    expect(session.redirectUrl).toBe(`http://localhost:3000/checkout/mock/order1?ref=${session.providerRef}`);
    expect(await provider.retrieve(session.providerRef)).toMatchObject({ orderId: "order1", status: "pending", amountSatang: 99_000 });
    expect(await provider.retrieve("mock_ไม่มี")).toBeNull();
  });

  it("จ่ายสำเร็จ → webhook ที่เซ็นแล้วผ่านการตรวจ และ retrieve ได้ paid", async () => {
    const { providerRef } = await checkout("order2");
    const hook = completeMockCharge(providerRef, "paid", "promptpay", SECRET)!;
    const event = provider.verifyWebhook(hook.body, new Headers({ [MOCK_SIGNATURE_HEADER]: hook.signature }));
    expect(event).toMatchObject({ type: "charge.complete", providerRef });
    expect(await provider.retrieve(providerRef)).toMatchObject({ status: "paid", method: "promptpay" });
    // จ่ายซ้ำไม่ได้
    expect(completeMockCharge(providerRef, "paid", "card", SECRET)).toBeNull();
  });

  it("ลายเซ็นผิด/ไม่มี/body ถูกแก้ → ไม่ผ่าน", async () => {
    const { providerRef } = await checkout("order3");
    const hook = completeMockCharge(providerRef, "failed", "card", SECRET)!;
    expect(provider.verifyWebhook(hook.body, new Headers())).toBeNull();
    expect(provider.verifyWebhook(hook.body, new Headers({ [MOCK_SIGNATURE_HEADER]: "00" }))).toBeNull();
    const tampered = hook.body.replace("charge.failed", "charge.complete");
    expect(provider.verifyWebhook(tampered, new Headers({ [MOCK_SIGNATURE_HEADER]: hook.signature }))).toBeNull();
    expect(provider.verifyWebhook("{}", new Headers({ [MOCK_SIGNATURE_HEADER]: signMockBody("{}", SECRET) }))).toBeNull();
  });

  it("คำสั่งซื้อหมดอายุแล้วจ่ายไม่สำเร็จ", async () => {
    const { providerRef } = await checkout("order4", -1);
    completeMockCharge(providerRef, "paid", "card", SECRET);
    expect(await provider.retrieve(providerRef)).toMatchObject({ status: "failed", paidAt: null });
  });

  it("คืนเงินได้เฉพาะรายการที่ชำระแล้วและเต็มจำนวน", async () => {
    const { providerRef } = await checkout("order5");
    await expect(provider.refund(providerRef, 99_000)).rejects.toThrow();
    completeMockCharge(providerRef, "paid", "card", SECRET);
    await expect(provider.refund(providerRef, 50_000)).rejects.toThrow();
    await expect(provider.refund(providerRef, 99_000)).resolves.toMatchObject({ refundRef: expect.stringMatching(/^rfnd_/) });
    expect(await provider.retrieve(providerRef)).toMatchObject({ status: "refunded" });
  });
});
