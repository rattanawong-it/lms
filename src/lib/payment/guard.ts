/**
 * M18 — หน้าชำระเงินจำลองให้คอร์สฟรีกับใครก็ได้ ถ้าหลุดไป production ระบบต้องไม่ยอมเริ่ม (phase-4-plan §7)
 * `next start` ของ Playwright เป็นโหมด production ด้วย จึงเปิดทางด้วย ALLOW_MOCK_PAYMENT=true ได้เฉพาะเครื่องทดสอบ
 * (pure — `env.ts` เรียกตอนตรวจ env และ unit test เรียกตรง)
 */
export function mockPaymentForbidden(source: {
  PAYMENT_PROVIDER?: string;
  NODE_ENV?: string;
  ALLOW_MOCK_PAYMENT?: string;
}): boolean {
  return source.PAYMENT_PROVIDER === "mock" && source.NODE_ENV === "production" && source.ALLOW_MOCK_PAYMENT !== "true";
}
