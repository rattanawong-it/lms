import { z } from "zod";

/** M14 · FR-14.1–14.3 — ตรวจข้อมูลรีวิว (ใช้ร่วม client/server) */

export const REVIEW_COMMENT_MAX = 2_000;
export const REVIEW_REPLY_MAX = 2_000;
/** FR-14.1 — ต้องเรียนไปแล้วอย่างน้อยกี่เปอร์เซ็นต์จึงรีวิวได้ */
export const REVIEW_MIN_PROGRESS = 30;
export const ADMIN_REVIEW_PAGE_SIZE = 30;

const text = (max: number, tooLong: string) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().max(max, tooLong));

const flag = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .nullish()
  .transform((v) => v === "on" || v === "true");

export const upsertReviewSchema = z.object({
  courseId: z.cuid("ไม่พบคอร์ส"),
  rating: z.coerce
    .number("กรุณาเลือกจำนวนดาว")
    .int("กรุณาเลือกจำนวนดาว")
    .min(1, "กรุณาเลือกจำนวนดาว 1–5")
    .max(5, "กรุณาเลือกจำนวนดาว 1–5"),
  // ความคิดเห็นไม่บังคับ — ค่าว่างเก็บเป็น null
  comment: text(REVIEW_COMMENT_MAX, `ความคิดเห็นยาวได้ไม่เกิน ${REVIEW_COMMENT_MAX.toLocaleString("th-TH")} ตัวอักษร`).transform(
    (v) => v || null,
  ),
});

/** ตอบกลับว่าง = ลบคำตอบกลับเดิม */
export const replyReviewSchema = z.object({
  id: z.cuid("ไม่พบรีวิว"),
  reply: text(REVIEW_REPLY_MAX, `คำตอบกลับยาวได้ไม่เกิน ${REVIEW_REPLY_MAX.toLocaleString("th-TH")} ตัวอักษร`),
});

export const hideReviewSchema = z.object({ id: z.cuid("ไม่พบรีวิว"), value: flag });

export const ADMIN_REVIEW_FILTERS = ["all", "hidden"] as const;
export type AdminReviewFilter = (typeof ADMIN_REVIEW_FILTERS)[number];
