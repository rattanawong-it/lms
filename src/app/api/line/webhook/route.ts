import { env, hasLine } from "@/lib/env";
import { verifyLineSignature } from "@/lib/line/signature";
import { handleLineEvent } from "@/features/line/lib/webhook";
import { lineWebhookSchema } from "@/features/line/schemas";

/**
 * M12 · system-design §5.7 — webhook ของ LINE Official Account
 *
 * ไม่มี session: ตัวตนของผู้เรียกพิสูจน์ด้วย `X-Line-Signature` เท่านั้น (ตรวจกับ body ดิบก่อนทำอะไร)
 * ตอบ 200 ทุกครั้งที่ลายเซ็นถูก แม้บาง event จัดการไม่สำเร็จ — ถ้าตอบ error LINE จะส่งซ้ำ
 * ระบบยังไม่เปิดใช้ LINE (ไม่มี env) → 404 เหมือนไม่มีเส้นทางนี้
 */
export async function POST(request: Request) {
  if (!hasLine) return new Response(null, { status: 404 });

  const body = await request.text();
  if (!verifyLineSignature(body, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET!)) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = lineWebhookSchema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });

  // ตอนกด "Verify" ในหน้า LINE Developers จะส่ง events ว่างมา — ตอบ 200 ก็พอ
  for (const event of parsed.data.events) {
    try {
      await handleLineEvent(event);
    } catch (error) {
      console.error("[line] จัดการ event ไม่สำเร็จ", event.type, error);
    }
  }
  return new Response(null, { status: 200 });
}
