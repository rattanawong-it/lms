import { z } from "zod";
import { Role } from "@/generated/prisma/enums";

const roleEnum = z.enum([Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.INSTRUCTOR, Role.STUDENT]);

/** FR-02.2 — ตัวกรองรายการผู้ใช้ */
export const userFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: roleEnum.optional(),
  departmentId: z.string().trim().optional(),
  status: z.enum(["all", "active", "banned", "unverified"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
export type UserFilter = z.infer<typeof userFilterSchema>;

/** FR-02.3 — กำหนด role และคณะให้ผู้ใช้ */
export const assignRoleSchema = z.object({
  userId: z.string().min(1, "ไม่พบผู้ใช้"),
  role: roleEnum,
  departmentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v === "none" ? null : (v ?? null))),
});
export type AssignRoleInput = z.input<typeof assignRoleSchema>;

/** FR-02.4 — ระงับ/เปิดใช้งานบัญชี */
export const banUserSchema = z.object({
  userId: z.string().min(1, "ไม่พบผู้ใช้"),
  banned: z.coerce.boolean(),
  reason: z.string().trim().max(200, "เหตุผลยาวเกินไป (ไม่เกิน 200 ตัวอักษร)").optional(),
});
export type BanUserInput = z.input<typeof banUserSchema>;

/** FR-02.5 — นำเข้าผู้ใช้จาก CSV (ชื่อ, อีเมล, role, คณะ) */
export const importRowSchema = z.object({
  name: z.string().trim().min(2, "ชื่อต้องยาวอย่างน้อย 2 ตัวอักษร").max(80, "ชื่อยาวเกินไป"),
  email: z
    .string()
    .trim()
    .pipe(z.email("รูปแบบอีเมลไม่ถูกต้อง"))
    .transform((v) => v.toLowerCase()),
  role: roleEnum.default(Role.STUDENT),
  departmentCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  externalId: z.string().trim().max(30, "รหัสนักศึกษา/พนักงานยาวเกินไป").optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const PAGE_SIZE = 20;
