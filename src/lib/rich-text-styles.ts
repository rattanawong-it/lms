/**
 * FR-05.10 — ค่าที่ยอมรับของรูปแบบเนื้อหา (system-design §8.4)
 *
 * ใช้ร่วมกันทั้ง editor (client), ตัวตรวจ `rich-text-doc.ts` (server) และตัว render `rich-text.tsx`
 * เก็บใน JSON เป็น **ชื่อ** เท่านั้น แล้วแปลงเป็น class ตอนแสดงผล — ไม่มีค่า CSS จากผู้ใช้หลุดเข้า DOM
 * class ทุกตัวต้องเขียนเต็มในไฟล์นี้ Tailwind ถึงจะเห็น (ห้ามประกอบสตริง)
 */

export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const TEXT_ALIGN_CLASS: Record<TextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

/** สีตัวอักษร — โทน 700 บนพื้นขาว / 300 บนพื้นมืด ผ่าน contrast 4.5:1 ทั้งคู่ */
export const TEXT_COLORS = {
  red: { label: "แดง", className: "text-red-700 dark:text-red-300", swatch: "bg-red-700" },
  orange: { label: "ส้ม", className: "text-orange-700 dark:text-orange-300", swatch: "bg-orange-700" },
  green: { label: "เขียว", className: "text-green-700 dark:text-green-300", swatch: "bg-green-700" },
  blue: { label: "น้ำเงิน", className: "text-blue-700 dark:text-blue-300", swatch: "bg-blue-700" },
  purple: { label: "ม่วง", className: "text-purple-700 dark:text-purple-300", swatch: "bg-purple-700" },
  gray: { label: "เทา", className: "text-zinc-500 dark:text-zinc-400", swatch: "bg-zinc-500" },
} as const;
export type TextColor = keyof typeof TEXT_COLORS;

/** ไฮไลต์ — พื้นอ่อน ตัวอักษรยังเป็นสีหลักของธีม */
export const HIGHLIGHT_COLORS = {
  yellow: { label: "เหลือง", className: "bg-yellow-200 dark:bg-yellow-500/30", swatch: "bg-yellow-300" },
  green: { label: "เขียว", className: "bg-green-200 dark:bg-green-500/30", swatch: "bg-green-300" },
  blue: { label: "ฟ้า", className: "bg-sky-200 dark:bg-sky-500/30", swatch: "bg-sky-300" },
  pink: { label: "ชมพู", className: "bg-pink-200 dark:bg-pink-500/30", swatch: "bg-pink-300" },
  orange: { label: "ส้ม", className: "bg-orange-200 dark:bg-orange-500/30", swatch: "bg-orange-300" },
} as const;
export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

/** กล่องเน้นข้อความ */
export const CALLOUT_TONES = {
  info: { label: "ข้อมูล", className: "border-info bg-info-bg" },
  warning: { label: "คำเตือน", className: "border-warning bg-warning-bg" },
  success: { label: "สำเร็จ", className: "border-success bg-success-bg" },
} as const;
export type CalloutTone = keyof typeof CALLOUT_TONES;

/** ขนาดรูปในบทความ — ไม่รับความกว้างเป็นพิกเซลอิสระ */
export const IMAGE_WIDTHS = {
  sm: { label: "เล็ก", className: "max-w-[min(100%,240px)]" },
  md: { label: "กลาง", className: "max-w-[min(100%,448px)]" },
  full: { label: "เต็มความกว้าง", className: "w-full" },
} as const;
export type ImageWidth = keyof typeof IMAGE_WIDTHS;

export const IMAGE_ALIGNS = {
  left: { label: "ชิดซ้าย", className: "mr-auto" },
  center: { label: "กึ่งกลาง", className: "mx-auto" },
  right: { label: "ชิดขวา", className: "ml-auto" },
} as const;
export type ImageAlign = keyof typeof IMAGE_ALIGNS;

/** คืนค่าเมื่อเป็นคีย์ที่รู้จัก ไม่งั้น null — ใช้ตรวจค่าจาก JSON/HTML ที่เชื่อไม่ได้ */
export function pick<T extends string>(allowed: readonly T[] | Record<T, unknown>, value: unknown): T | null {
  if (typeof value !== "string") return null;
  const keys = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  return (keys as readonly string[]).includes(value) ? (value as T) : null;
}
