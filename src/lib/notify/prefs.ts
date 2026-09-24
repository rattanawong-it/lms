import { NotificationType } from "@/generated/prisma/enums";

/**
 * M11 · FR-11.4 — การตั้งค่าช่องทางแจ้งเตือนของผู้ใช้ (`User.notifyPrefs`)
 *
 * pure ทั้งไฟล์ — ใช้ทั้งฝั่ง server (เลือกผู้รับ) หน้าตั้งค่า และ unit test
 * รูปแบบที่เก็บ: `{ "<NotificationType>": { "email": bool, "line": bool } }`
 * key ที่ไม่มี/ค่าผิดชนิดใช้ค่าเริ่มต้น · ในแอปเปิดเสมอ ปิดไม่ได้ จึงไม่อยู่ในนี้
 */
export const NOTIFY_CHANNELS = ["email", "line"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
export type ChannelPrefs = Record<NotifyChannel, boolean>;
export type NotifyPrefs = Record<NotificationType, ChannelPrefs>;

export const NOTIFY_CHANNEL_LABEL: Record<NotifyChannel, string> = { email: "อีเมล", line: "LINE" };

/** ลำดับที่แสดงในหน้าตั้งค่า */
export const NOTIFY_TYPES: readonly NotificationType[] = [
  NotificationType.ENROLLED,
  NotificationType.GRADED,
  NotificationType.DUE_SOON,
  NotificationType.CERTIFICATE,
  NotificationType.ANNOUNCEMENT,
  NotificationType.LIVE_SOON,
  NotificationType.QA_REPLY,
  NotificationType.SYSTEM,
];

export const NOTIFY_TYPE_LABEL: Record<NotificationType, { label: string; hint: string }> = {
  ENROLLED: { label: "การลงทะเบียนและการเรียนจบ", hint: "ลงทะเบียนสำเร็จ ผลคำขอเข้าเรียน และเมื่อเรียนจบคอร์ส" },
  GRADED: { label: "ได้รับคะแนน", hint: "ผู้สอนตรวจแบบทดสอบหรืองานของคุณแล้ว" },
  DUE_SOON: { label: "งานใกล้ครบกำหนด", hint: "งานที่ยังไม่ส่งและครบกำหนดภายใน 24 ชั่วโมง" },
  CERTIFICATE: { label: "ใบประกาศ", hint: "เมื่อได้รับใบประกาศนียบัตร" },
  ANNOUNCEMENT: { label: "ประกาศ", hint: "ประกาศจากผู้สอน คณะ หรือผู้ดูแลระบบ" },
  LIVE_SOON: { label: "คาบเรียนสดใกล้เริ่ม", hint: "คาบเรียนสดที่จะเริ่มภายใน 1 ชั่วโมง" },
  QA_REPLY: { label: "ถาม-ตอบ", hint: "มีคนตอบคำถามของคุณ หรือมีคำถามใหม่ในคอร์สที่คุณสอน" },
  SYSTEM: { label: "แจ้งจากระบบ", hint: "เรื่องเกี่ยวกับบัญชีและระบบ" },
};

/**
 * เปิดช่องทางภายนอกเป็นค่าเริ่มต้นเฉพาะเหตุการณ์ที่ FR-11.3 ระบุ
 * ประกาศปิดไว้ — ประกาศทั้งระบบหนึ่งครั้ง = อีเมลเป็นหมื่นฉบับ (phase-3-plan §7)
 * LINE ใช้ค่าเดียวกับอีเมล (มีผลเมื่อผูกบัญชีแล้วเท่านั้น)
 */
const ON_BY_DEFAULT: ReadonlySet<NotificationType> = new Set([
  NotificationType.ENROLLED,
  NotificationType.GRADED,
  NotificationType.DUE_SOON,
  NotificationType.CERTIFICATE,
]);

export function defaultNotifyPrefs(): NotifyPrefs {
  return Object.fromEntries(
    NOTIFY_TYPES.map((type) => {
      const on = ON_BY_DEFAULT.has(type);
      return [type, { email: on, line: on }];
    }),
  ) as NotifyPrefs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** อ่านค่าจาก DB แบบไม่เชื่อรูปแบบ — เติมค่าเริ่มต้นให้ครบทุกชนิดและทุกช่องทาง */
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  const prefs = defaultNotifyPrefs();
  if (!isRecord(raw)) return prefs;
  for (const type of NOTIFY_TYPES) {
    const stored = raw[type];
    if (!isRecord(stored)) continue;
    for (const channel of NOTIFY_CHANNELS) {
      if (typeof stored[channel] === "boolean") prefs[type][channel] = stored[channel];
    }
  }
  return prefs;
}

export function wantsChannel(raw: unknown, type: NotificationType, channel: NotifyChannel): boolean {
  return parseNotifyPrefs(raw)[type][channel];
}

/** ผู้รับที่เปิดช่องทางนี้ไว้สำหรับการแจ้งเตือนชนิดนี้ */
export function pickRecipients<T extends { notifyPrefs: unknown }>(
  users: readonly T[],
  type: NotificationType,
  channel: NotifyChannel,
): T[] {
  return users.filter((u) => wantsChannel(u.notifyPrefs, type, channel));
}

/** ชื่อ checkbox ในหน้าตั้งค่า เช่น `GRADED.email` */
export function prefFieldName(type: NotificationType, channel: NotifyChannel): string {
  return `${type}.${channel}`;
}

/**
 * แปลงฟอร์มหน้าตั้งค่าเป็นค่าที่จะเก็บ — checkbox ที่ไม่ติ๊กไม่ถูกส่งมา = ปิด
 * ช่องทางที่ใช้ไม่ได้ตอนนี้ (เช่น ยังไม่ผูก LINE — checkbox ถูก disable จึงไม่ถูกส่งมา)
 * คงค่าเดิมไว้ ไม่ล้างทิ้ง
 */
export function notifyPrefsFromForm(
  form: { has(name: string): boolean },
  current: unknown,
  editable: readonly NotifyChannel[],
): NotifyPrefs {
  const prefs = parseNotifyPrefs(current);
  for (const type of NOTIFY_TYPES) {
    for (const channel of editable) prefs[type][channel] = form.has(prefFieldName(type, channel));
  }
  return prefs;
}
