import "server-only";
import { env } from "@/lib/env";
import { chunk } from "@/lib/notify/chunk";

/**
 * M12 — เรียก LINE Messaging API ด้วย `fetch` (ไม่ใช้ SDK · system-design §2)
 * ทุกฟังก์ชันไม่ throw — การส่ง LINE ล้มไม่ควรกระทบงานหลัก · log แล้วคืน false/จำนวนที่ส่งได้
 */

/** multicast รับผู้รับได้ไม่เกิน 500 คนต่อครั้ง */
export const LINE_MULTICAST_MAX = 500;
/** ข้อความ text ของ LINE ยาวได้ไม่เกิน 5,000 ตัวอักษร */
export const LINE_TEXT_MAX = 5_000;

async function callLine(path: string, payload: unknown): Promise<boolean> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return false;
  try {
    const res = await fetch(new URL(path, env.LINE_API_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[line] ${path} ตอบ ${res.status}`, await res.text().catch(() => ""));
    return res.ok;
  } catch (error) {
    console.error(`[line] เรียก ${path} ไม่สำเร็จ`, error);
    return false;
  }
}

function textMessage(text: string) {
  return { type: "text", text: text.slice(0, LINE_TEXT_MAX) };
}

/** ตอบกลับข้อความที่ผู้ใช้เพิ่งส่งมา (replyToken ใช้ได้ครั้งเดียวภายในไม่กี่นาที) */
export function replyText(replyToken: string, text: string): Promise<boolean> {
  return callLine("/v2/bot/message/reply", { replyToken, messages: [textMessage(text)] });
}

/** ส่งข้อความเดียวกันให้หลายคน · คืนจำนวนผู้รับในชุดที่ส่งสำเร็จ */
export async function multicastText(lineUserIds: readonly string[], text: string): Promise<number> {
  let sent = 0;
  for (const to of chunk(lineUserIds, LINE_MULTICAST_MAX)) {
    if (await callLine("/v2/bot/message/multicast", { to, messages: [textMessage(text)] })) sent += to.length;
  }
  return sent;
}
