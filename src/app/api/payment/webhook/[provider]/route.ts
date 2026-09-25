import { handlePaymentWebhook } from "@/features/commerce/lib/webhook";

/**
 * M18 · FR-18.1 — webhook ของผู้ให้บริการชำระเงิน
 * ตัวตนพิสูจน์ด้วยลายเซ็นเท่านั้น ไม่มี session (เหมือน /api/line/webhook) · อ่าน body ดิบก่อนแปลง JSON เพื่อตรวจลายเซ็น
 * ตอบ 5xx เมื่อประมวลผลล้ม → ผู้ให้บริการยิงซ้ำ (event ที่ยังไม่ processed ถูกทำใหม่)
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await request.text();
  try {
    const result = await handlePaymentWebhook(provider, rawBody, request.headers);
    return new Response(result.message, { status: result.status });
  } catch (error) {
    console.error("[payment] ประมวลผล webhook ไม่สำเร็จ", error);
    return new Response("error", { status: 500 });
  }
}
