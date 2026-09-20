import { z } from "zod";

/**
 * M01 — Zod schema ใช้ร่วมทั้ง client และ server (DoD ข้อ Schema)
 * ข้อความ error เป็นภาษาไทยทั้งหมด
 */
const email = z
  .string()
  .trim()
  .min(1, "กรุณากรอกอีเมล")
  .pipe(z.email("รูปแบบอีเมลไม่ถูกต้อง"))
  .transform((v) => v.toLowerCase());

/** FR-01.1 · รหัสผ่านอย่างน้อย 8 ตัวอักษร */
const password = z
  .string()
  .min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
  .max(128, "รหัสผ่านยาวเกินไป (ไม่เกิน 128 ตัวอักษร)");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
  rememberMe: z.boolean().default(true),
});
export type LoginInput = z.input<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "กรุณากรอกชื่อ-นามสกุล")
      .max(80, "ชื่อยาวเกินไป (ไม่เกิน 80 ตัวอักษร)"),
    email,
    password,
    confirmPassword: z.string().min(1, "กรุณายืนยันรหัสผ่าน"),
    // FR-01.8 · ต้องยอมรับนโยบายความเป็นส่วนตัวก่อนสมัคร
    pdpaConsent: z.literal(true, {
      message: "ต้องยอมรับนโยบายความเป็นส่วนตัวก่อนสมัครสมาชิก",
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง"),
    password,
    confirmPassword: z.string().min(1, "กรุณายืนยันรหัสผ่าน"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

/** FR-01.5 · จัดการโปรไฟล์ */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "กรุณากรอกชื่อ-นามสกุล").max(80, "ชื่อยาวเกินไป"),
  phone: z
    .string()
    .trim()
    .regex(/^$|^0\d{8,9}$/, "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0")
    .optional(),
  externalId: z
    .string()
    .trim()
    .max(30, "รหัสนักศึกษา/พนักงานยาวเกินไป")
    .optional(),
});
export type ProfileInput = z.input<typeof profileSchema>;

/** เกณฑ์ความแข็งแรงของรหัสผ่าน — ใช้แสดงผลอย่างเดียว ไม่บังคับ (ตาม FR-01.1) */
export const PASSWORD_RULES = [
  { id: "len", label: "ยาวอย่างน้อย 8 ตัวอักษร", test: (v: string) => v.length >= 8 },
  { id: "case", label: "มีตัวพิมพ์ใหญ่และเล็ก", test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: "num", label: "มีตัวเลขอย่างน้อย 1 ตัว", test: (v: string) => /\d/.test(v) },
  { id: "sym", label: "มีอักขระพิเศษ เช่น ! @ #", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function passwordStrength(value: string) {
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length;
  if (!value) return { score: 0, label: "", tone: "muted" as const };
  if (passed <= 1) return { score: 1, label: "อ่อนมาก", tone: "danger" as const };
  if (passed === 2) return { score: 2, label: "พอใช้", tone: "warning" as const };
  if (passed === 3) return { score: 3, label: "ดี", tone: "info" as const };
  return { score: 4, label: "แข็งแรงมาก", tone: "success" as const };
}
