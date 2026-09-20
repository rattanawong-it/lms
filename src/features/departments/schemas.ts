import { z } from "zod";

/** M02 · FR-02.1 — CRUD คณะ/หน่วยงาน (รองรับลำดับชั้น parent–child) */
export const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "รหัสคณะต้องยาวอย่างน้อย 2 ตัวอักษร")
    .max(20, "รหัสคณะยาวเกินไป (ไม่เกิน 20 ตัวอักษร)")
    .regex(/^[A-Za-z0-9_-]+$/, "รหัสคณะใช้ได้เฉพาะ A-Z a-z 0-9 - และ _")
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(2, "กรุณากรอกชื่อคณะ/หน่วยงาน")
    .max(120, "ชื่อยาวเกินไป (ไม่เกิน 120 ตัวอักษร)"),
  parentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v === "none" ? null : (v ?? null))),
});
export type DepartmentInput = z.input<typeof departmentSchema>;

export const departmentUpdateSchema = departmentSchema.extend({
  id: z.string().min(1, "ไม่พบคณะที่ต้องการแก้ไข"),
});
export type DepartmentUpdateInput = z.input<typeof departmentUpdateSchema>;

export const departmentDeleteSchema = z.object({
  id: z.string().min(1, "ไม่พบคณะที่ต้องการลบ"),
});
