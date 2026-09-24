import "server-only";
import { replyText } from "@/lib/line/client";
import { rateLimit } from "@/lib/rate-limit";
import { redeemLinkCode, unlink } from "@/features/line/lib/link";
import { LINE_REPLY, parseLinkCode, type LineWebhookEvent } from "@/features/line/schemas";

/**
 * M12 — จัดการ event จาก LINE ทีละรายการ (เรียกหลังตรวจลายเซ็นแล้วเท่านั้น)
 * | event | ทำอะไร |
 * | message ข้อความรหัส 6 หลัก | ผูกบัญชี → ตอบว่าสำเร็จ/รหัสผิด |
 * | message อื่น · follow | ตอบวิธีผูกบัญชี |
 * | unfollow | ยกเลิกการผูก (FR-12.4) |
 * event จากกลุ่ม/ห้อง หรือไม่มี userId ไม่สนใจ
 */
/** ลองรหัสได้ 5 ครั้งต่อ 15 นาทีต่อบัญชี LINE — โอกาสเดาถูกรหัส 6 หลักที่ยังใช้ได้แทบเป็นศูนย์ */
export const CODE_QUOTA = { windowSec: 15 * 60, max: 5 };

export async function handleLineEvent(event: LineWebhookEvent): Promise<void> {
  const lineUserId = event.source?.type === "user" ? event.source.userId : undefined;
  if (!lineUserId) return;

  if (event.type === "unfollow") {
    await unlink({ lineUserId }, "unfollow");
    return;
  }

  let reply: string | null = null;
  if (event.type === "follow") {
    reply = LINE_REPLY.help;
  } else if (event.type === "message") {
    const code = event.message?.type === "text" && event.message.text ? parseLinkCode(event.message.text) : null;
    if (!code) reply = LINE_REPLY.help;
    // กันเดารหัสของคนอื่น (ผูก LINE ของผู้โจมตีเข้ากับบัญชีเหยื่อ) — จำกัดจำนวนครั้งต่อบัญชี LINE
    else if (!rateLimit(`line-code:${lineUserId}`, CODE_QUOTA).ok) reply = LINE_REPLY.tooMany;
    else reply = (await redeemLinkCode(code, lineUserId)) ? LINE_REPLY.linked : LINE_REPLY.invalidCode;
  }

  if (reply && event.replyToken) await replyText(event.replyToken, reply);
}
