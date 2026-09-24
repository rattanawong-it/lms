import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderEmail, sendMail } from "@/lib/mail";
import { chunk } from "@/lib/notify/chunk";
import { NOTIFY_TYPE_LABEL, pickRecipients } from "@/lib/notify/prefs";
import type { NotifyInput } from "@/lib/notify/types";

/**
 * M11 · FR-11.3 — ช่องทางอีเมลของ `notify()`
 *
 * ส่งเฉพาะผู้ที่เปิดอีเมลของชนิดนั้นไว้ (FR-11.4) ไม่ถูกระงับ และยืนยันอีเมลแล้ว
 * ทีละ `EMAIL_BATCH` ฉบับพร้อมกัน — ผู้ให้บริการอีเมลจำกัดการเชื่อมต่อพร้อมกัน
 * ฉบับที่ส่งไม่สำเร็จ log แล้วข้าม (การแจ้งเตือนในแอปยังอยู่เสมอ)
 */
export const EMAIL_BATCH = 5;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** หัวข้อ/เนื้อหามาจากข้อมูลที่ผู้ใช้ตั้ง (ชื่อคอร์ส, ชื่องาน) — ต้อง escape ก่อนเข้า HTML */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** ลิงก์ในแอปเป็น path — อีเมลต้องเป็น URL เต็ม · ไม่มีลิงก์ไปหน้ารวมการแจ้งเตือน */
export function absoluteLink(link: string | null | undefined, base = env.NEXT_PUBLIC_APP_URL): string {
  // "//host" คือ URL ข้ามโดเมน (protocol-relative) ไม่ใช่ path ในแอป
  const path = link && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") ? link : "/notifications";
  return new URL(path, base).toString();
}

export function buildNotificationEmail(input: Pick<NotifyInput, "type" | "title" | "body" | "link">) {
  const settingsUrl = absoluteLink("/settings/notifications");
  const url = absoluteLink(input.link);
  const label = NOTIFY_TYPE_LABEL[input.type].label;
  const body = input.body?.trim() || NOTIFY_TYPE_LABEL[input.type].hint;
  return {
    subject: input.title,
    html: renderEmail({
      heading: escapeHtml(input.title),
      body: escapeHtml(body),
      ctaLabel: "เปิดดูใน KRIRK LMS",
      ctaUrl: escapeHtml(url),
      footnote: `คุณได้รับอีเมลนี้เพราะเปิดรับการแจ้งเตือน “${escapeHtml(label)}” ทางอีเมล · เปลี่ยนได้ที่ ${escapeHtml(settingsUrl)}`,
    }),
    text: `${input.title}\n\n${body}\n\n${url}\n\nเปลี่ยนการตั้งค่าการแจ้งเตือน: ${settingsUrl}`,
  };
}

export async function sendEmailNotifications(input: NotifyInput, userIds: readonly string[]): Promise<number> {
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] }, banned: false, emailVerified: true },
    select: { email: true, notifyPrefs: true },
  });
  const recipients = pickRecipients(users, input.type, "email");
  if (recipients.length === 0) return 0;

  const message = buildNotificationEmail(input);
  let sent = 0;
  for (const batch of chunk(recipients, EMAIL_BATCH)) {
    const results = await Promise.allSettled(batch.map((u) => sendMail({ to: u.email, ...message })));
    for (const r of results) {
      if (r.status === "fulfilled") sent += 1;
      else console.error("[notify:email] ส่งอีเมลไม่สำเร็จ", r.reason);
    }
  }
  return sent;
}
