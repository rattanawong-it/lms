/**
 * NFR-09 — เก็บเวลาเป็น UTC แสดงผลเป็น Asia/Bangkok ด้วยปี พ.ศ.
 */
const TZ = "Asia/Bangkok";
const LOCALE = "th-TH-u-ca-buddhist";

/** 20 ก.ย. 2569 */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** 20 กันยายน 2569 */
export function formatDateLong(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

/** 20 ก.ย. 2569 14:35 น. */
export function formatDateTime(value: Date | string | number): string {
  const formatted = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return `${formatted} น.`;
}

/** "3 ชั่วโมงที่แล้ว" / "ใน 2 วัน" */
export function formatRelative(value: Date | string | number, base: Date = new Date()): string {
  const diffMs = new Date(value).getTime() - base.getTime();
  const rtf = new Intl.RelativeTimeFormat("th-TH", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return "เมื่อสักครู่";
}

/**
 * ความยาวเป็นวินาที → "12 นาที" / "1 ชม. 5 นาที" (คืน null เมื่อไม่รู้ความยาว)
 * ใช้ร่วมกันระหว่างหน้ารายละเอียดคอร์ส สารบัญ และตัวเล่นวิดีโอ
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

/**
 * ค่าของ `<input type="datetime-local">` เป็นเวลาท้องถิ่นไม่มีโซน — ระบบตีความเป็นเวลาไทยเสมอ
 * (ไม่ใช้โซนของเบราว์เซอร์/เซิร์ฟเวอร์ ซึ่งอาจไม่ใช่ Asia/Bangkok ตอน deploy)
 * "2026-09-30T13:00" ↔ 2026-09-30T06:00:00.000Z
 */
export function fromBangkokInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toBangkokInput(value: Date | null | undefined): string {
  if (!value) return "";
  return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
