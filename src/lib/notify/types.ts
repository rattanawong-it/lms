import type { NotificationType } from "@/generated/prisma/enums";

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /**
   * กันแจ้งซ้ำ (cron แจ้งล่วงหน้า FR-12.3) — ผู้ที่เคยได้รับ key นี้แล้วถูกข้ามทั้งในแอปและช่องทางภายนอก
   * ใช้ unique `[userId, dedupeKey]` ใน DB จึงปลอดภัยแม้ cron รันซ้อนกัน
   */
  dedupeKey?: string;
};
