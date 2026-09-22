import { z } from "zod";

/** M06 — ตรวจข้อมูลการลงทะเบียนและความคืบหน้า (ใช้ร่วม client/server) */

/**
 * วันหมดสิทธิ์เรียน (FR-06.2)
 * ช่อง `<input type="date">` ส่งมาเป็น "YYYY-MM-DD" และส่งค่าว่างเมื่อไม่กรอก
 * ตีความเป็น "สิ้นวันตามเวลาไทย" เพื่อให้ผู้เรียนใช้สิทธิ์ได้จนจบวันที่ระบุ
 */
const expiresAt = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "รูปแบบวันที่ไม่ถูกต้อง")
  .transform((v) => (v === null ? null : endOfDayBangkok(v)));

/** "2026-09-30" → 2026-09-30T16:59:59.999Z (23:59:59.999 ตามเวลาไทย) */
export function endOfDayBangkok(value: string): Date {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1 - 7 * 60 * 60 * 1000);
  }
  return date;
}

/** FR-06.1 — ผู้เรียนกดลงทะเบียนเอง */
export const enrollSchema = z.object({
  courseId: z.cuid("ไม่พบคอร์สที่ต้องการลงทะเบียน"),
});

/** FR-06.1 — ผู้สอน/ผู้ดูแลอนุมัติหรือปฏิเสธคำขอ */
export const DECISIONS = ["approve", "reject"] as const;
export type EnrollDecision = (typeof DECISIONS)[number];

export const decisionSchema = z.object({
  enrollmentId: z.cuid("ไม่พบคำขอลงทะเบียน"),
  decision: z.enum(DECISIONS),
});

/** ถอนผู้เรียนออกจากคอร์ส หรือผู้เรียนถอนตัวเอง */
export const dropSchema = z.object({
  enrollmentId: z.cuid("ไม่พบการลงทะเบียน"),
});

/** แก้วันหมดสิทธิ์ของผู้เรียนรายคน (FR-06.2) */
export const expirySchema = z.object({
  enrollmentId: z.cuid("ไม่พบการลงทะเบียน"),
  expiresAt,
});

/**
 * FR-06.2 — ลงทะเบียนกลุ่ม
 *
 * รับอีเมลได้ทั้งพิมพ์เองทีละบรรทัดและวางเนื้อหาไฟล์ CSV ลงไปตรง ๆ
 * จึงแยกอีเมลออกจากข้อความด้วย `parseEmailList()` แทนการบังคับรูปแบบตายตัว
 */
export const MAX_BULK_ENROLL = 500;

export const bulkEnrollSchema = z.object({
  courseId: z.cuid("ไม่พบคอร์ส"),
  emails: z
    .string()
    .min(1, "กรุณากรอกอีเมลผู้เรียนอย่างน้อย 1 คน")
    .transform(parseEmailList)
    .refine((list) => list.length > 0, "ไม่พบอีเมลที่ใช้ได้ในข้อความที่กรอก")
    .refine(
      (list) => list.length <= MAX_BULK_ENROLL,
      `ลงทะเบียนได้ครั้งละไม่เกิน ${MAX_BULK_ENROLL} คน`,
    ),
  expiresAt,
});

/**
 * ดึงอีเมลออกจากข้อความอิสระ — รองรับทั้งบรรทัดละอีเมล, คั่นด้วย , หรือ ;
 * และแถว CSV ที่มีคอลัมน์อื่นปนมา (`สมชาย,somchai@krirk.ac.th,STUDENT`)
 * ผลลัพธ์เป็นตัวพิมพ์เล็กและไม่ซ้ำกัน
 */
export function parseEmailList(raw: string): string[] {
  const found = raw
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return found ? [...new Set(found)] : [];
}

/** FR-06.3 — บันทึกตำแหน่งวิดีโอล่าสุด (เรียกถี่ ทุก 15 วินาที) */
export const saveProgressSchema = z.object({
  lessonId: z.cuid("ไม่พบบทเรียน"),
  positionSec: z.coerce
    .number()
    .int("ตำแหน่งต้องเป็นจำนวนเต็ม")
    .min(0, "ตำแหน่งต้องไม่ติดลบ")
    .max(24 * 60 * 60, "ตำแหน่งเกินความยาวที่รองรับ"),
});

/** FR-06.3 — กด "เรียนจบบทนี้" หรือระบบตัดสินให้จากการดูวิดีโอครบ 90% */
export const markCompleteSchema = z.object({
  lessonId: z.cuid("ไม่พบบทเรียน"),
  completed: z.coerce.boolean().default(true),
});
