import { z } from "zod";

/** M03 · FR-03.1 — CRUD หมวดหมู่คอร์ส (รองรับลำดับชั้น parent–child เหมือนคณะ) */
export const categorySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "slug ต้องยาวอย่างน้อย 2 ตัวอักษร")
    .max(60, "slug ยาวเกินไป (ไม่เกิน 60 ตัวอักษร)")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug ใช้ได้เฉพาะ a-z 0-9 และ - คั่นคำ")
    .transform((v) => v.toLowerCase()),
  name: z
    .string()
    .trim()
    .min(2, "กรุณากรอกชื่อหมวดหมู่")
    .max(120, "ชื่อยาวเกินไป (ไม่เกิน 120 ตัวอักษร)"),
  parentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v === "none" ? null : (v ?? null))),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const categoryUpdateSchema = categorySchema.extend({
  id: z.string().min(1, "ไม่พบหมวดหมู่ที่ต้องการแก้ไข"),
});

export const categoryDeleteSchema = z.object({
  id: z.string().min(1, "ไม่พบหมวดหมู่ที่ต้องการลบ"),
});
