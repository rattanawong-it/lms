import "server-only";
import { db } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * M11 · system-design §7 — จุดเดียวที่ยิงการแจ้งเตือน
 *
 * เฟส 1 มีช่องทางเดียวคือในแอป (ตาราง `Notification`)
 * เฟส 3 จะเพิ่ม adapter อีเมล/LINE ที่นี่ตามการตั้งค่าของผู้ใช้ (FR-11.3/11.4, M12)
 * โดยที่ฟีเจอร์ต้นทางไม่ต้องแก้อะไรเลย
 */
export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/** จำนวนแถวต่อหนึ่ง INSERT — ประกาศทั้งระบบอาจมีผู้รับเป็นหมื่นคน */
export const NOTIFY_CHUNK_SIZE = 1_000;

/** ตัดรายการเป็นชุด ๆ ละ `size` ตัว — แยกออกมาเพื่อให้ unit test ได้ */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * สร้างการแจ้งเตือนให้ผู้รับทุกคน (ตัด id ซ้ำออกก่อน)
 *
 * ไม่ throw — การแจ้งเตือนล้มไม่ควรทำให้งานหลักที่สำเร็จแล้ว (ลงทะเบียน, เผยแพร่ประกาศ)
 * กลายเป็นล้มเหลวในสายตาผู้ใช้ · คืนจำนวนแถวที่สร้างได้จริงไว้ใช้ในข้อความตอบกลับ
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
  return created;
}
