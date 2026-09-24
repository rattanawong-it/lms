import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSessionUser, requireUser } from "@/lib/rbac";
import { parseNotifyPrefs } from "@/lib/notify/prefs";
import { channelStatus } from "@/features/notifications/lib/channels";

/** M11 · FR-11.2 — การแจ้งเตือนในแอปของผู้ใช้ที่ล็อกอินอยู่ (อ่านได้เฉพาะของตัวเอง) */

export const NOTIFICATION_PAGE_SIZE = 30;

export type NotificationFilter = "all" | "unread";

export function parseNotificationFilter(value: unknown): NotificationFilter {
  return value === "unread" ? "unread" : "all";
}

/**
 * ตัวเลขบนกระดิ่ง — layout เรียกทุกหน้า จึง cache ต่อ request และใช้ index `[userId, readAt]`
 * ไม่มี session คืน 0 แทนการ redirect เพราะ layout ตรวจ `requireUser()` ไปแล้ว
 */
export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const user = await getSessionUser();
  if (!user) return 0;
  return db.notification.count({ where: { userId: user.id, readAt: null } });
});

export async function getNotifications(filter: NotificationFilter, page: number) {
  const user = await requireUser();
  const where = { userId: user.id, ...(filter === "unread" ? { readAt: null } : {}) };
  const current = Math.max(1, Math.floor(page) || 1);

  const [items, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * NOTIFICATION_PAGE_SIZE,
      take: NOTIFICATION_PAGE_SIZE,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return {
    items,
    total,
    unread,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE)),
  };
}

export type NotificationItem = Awaited<ReturnType<typeof getNotifications>>["items"][number];

/** FR-11.4 — การตั้งค่าช่องทางแจ้งเตือนของตัวเอง (ค่าที่ไม่เคยตั้งเติมด้วยค่าเริ่มต้น) */
export async function getMyNotifyPrefs() {
  const user = await requireUser();
  const [row, channels] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notifyPrefs: true, email: true } }),
    channelStatus(user.id),
  ]);
  return { prefs: parseNotifyPrefs(row.notifyPrefs), email: row.email, channels };
}
