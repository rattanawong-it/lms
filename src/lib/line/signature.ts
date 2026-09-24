import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * M12 · FR-12.1 — ตรวจ `X-Line-Signature` ของ webhook
 * LINE เซ็น body ดิบ (ไบต์ตามที่ส่งมา) ด้วย HMAC-SHA256 ของ channel secret แล้วเข้ารหัส base64
 * ต้องตรวจก่อนแปลง JSON และเทียบแบบเวลาคงที่ (กันเดาลายเซ็นทีละไบต์จากเวลาที่ตอบ)
 */
export function signLineBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

export function verifyLineSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signLineBody(body, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
