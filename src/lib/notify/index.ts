import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { chunk } from "@/lib/notify/chunk";
import { sendEmailNotifications } from "@/lib/notify/channels/email";
import { sendLineNotifications } from "@/lib/notify/channels/line";
import type { NotifyInput } from "@/lib/notify/types";

/**
 * M11 · system-design §7 — จุดเดียวที่ยิงการแจ้งเตือน
 *
 * 1. ในแอป (ตาราง `Notification`) — เปิดเสมอ เขียนทันทีก่อนคืนค่า
 * 2. ช่องทางภายนอกตาม `User.notifyPrefs` (FR-11.3/11.4) — ส่งหลัง response ด้วย `after()`
 *    ไม่ให้ผู้ใช้รออีเมล/LINE · อีเมลกับ LINE ส่งพร้อมกันและล้มแยกกัน
 * ฟีเจอร์ต้นทางเรียก `notify()` แบบเดิมโดยไม่ต้องรู้ว่ามีช่องทางอะไรบ้าง
 */
export { chunk };
export type { NotifyInput };

/** จำนวนแถวต่อหนึ่ง INSERT — ประกาศทั้งระบบอาจมีผู้รับเป็นหมื่นคน */
export const NOTIFY_CHUNK_SIZE = 1_000;

async function deliverExternal(input: NotifyInput, userIds: readonly string[]): Promise<void> {
  const results = await Promise.allSettled([
    sendEmailNotifications(input, userIds),
    sendLineNotifications(input, userIds),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[notify] ส่งช่องทางภายนอกไม่สำเร็จ", r.reason);
  }
}

/**
 * รันงานหลัง response · นอก request (seed, สคริปต์, unit test) `after()` throw
 * จึงรันต่อทันทีแบบไม่รอผลแทน — งานภายนอกจับ error เองทั้งหมดแล้ว
 */
function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * สร้างการแจ้งเตือนให้ผู้รับทุกคน (ตัด id ซ้ำออกก่อน)
 *
 * ไม่ throw — การแจ้งเตือนล้มไม่ควรทำให้งานหลักที่สำเร็จแล้ว (ลงทะเบียน, เผยแพร่ประกาศ)
 * กลายเป็นล้มเหลวในสายตาผู้ใช้ · คืนจำนวนแถวในแอปที่สร้างได้จริงไว้ใช้ในข้อความตอบกลับ
 */
export async function notify(input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return 0;

  let created = 0;
  try {
    for (const ids of chunk(userIds, NOTIFY_CHUNK_SIZE)) {
      const result = await db.notification.createMany({
        data: ids.map((userId) => ({
          userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
        })),
      });
      created += result.count;
    }
  } catch (error) {
    console.error("[notify] สร้างการแจ้งเตือนไม่สำเร็จ", error);
  }

  runAfterResponse(() => deliverExternal(input, userIds));
  return created;
}
