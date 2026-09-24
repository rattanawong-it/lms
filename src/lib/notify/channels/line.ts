import "server-only";
import { db } from "@/lib/db";
import { hasLine } from "@/lib/env";
import { multicastText } from "@/lib/line/client";
import { absoluteLink } from "@/lib/notify/channels/email";
import { pickRecipients } from "@/lib/notify/prefs";
import type { NotifyInput } from "@/lib/notify/types";

/**
 * M12 · FR-12.2 — ช่องทาง LINE ของ `notify()`
 * ส่งเฉพาะผู้ที่ผูกบัญชีแล้ว ไม่ถูกระงับ และเปิด LINE ของชนิดนั้นไว้ (FR-11.4)
 * LINE เป็นข้อความล้วน ไม่ต้อง escape · ลิงก์ผ่าน `absoluteLink()` ตัวเดียวกับอีเมล
 */
export function buildLineText(input: Pick<NotifyInput, "title" | "body" | "link">): string {
  return [input.title, input.body?.trim(), absoluteLink(input.link)].filter(Boolean).join("\n\n");
}

export async function sendLineNotifications(input: NotifyInput, userIds: readonly string[]): Promise<number> {
  if (!hasLine) return 0;
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] }, banned: false, lineLink: { isNot: null } },
    select: { notifyPrefs: true, lineLink: { select: { lineUserId: true } } },
  });
  const to = pickRecipients(users, input.type, "line").flatMap((u) => (u.lineLink ? [u.lineLink.lineUserId] : []));
  if (to.length === 0) return 0;
  return multicastText(to, buildLineText(input));
}
