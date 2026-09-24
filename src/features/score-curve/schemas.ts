import { z } from "zod";
import { GradingMode } from "@/generated/prisma/enums";
import { checkCurve, MAX_CURVE_BANDS, sortBands } from "@/features/gradebook/lib/curve";

/**
 * M09 · FR-09.6–09.9 — Score Curve (ใช้ร่วม client/server)
 * ตรวจช่องเดี่ยวด้วย Zod แล้วตรวจทั้งส่วนด้วย `checkCurve()` ตัวเดียวกับที่หน้าจอใช้ตรวจสด
 */

const score = (name: string) =>
  z.coerce
    .number(`${name} ต้องเป็นตัวเลข`)
    .min(0, `${name} ต้องไม่ต่ำกว่า 0`)
    .max(100, `${name} ต้องไม่เกิน 100`);

const bandSchema = z.object({
  label: z.string().trim().min(1, "กรุณาใส่ชื่อ").max(5, "ชื่อยาวได้ไม่เกิน 5 ตัวอักษร"),
  min: score("Min"),
  max: score("Max"),
});

const sectionSchema = z
  .array(bandSchema)
  .max(MAX_CURVE_BANDS, `มีได้ไม่เกิน ${MAX_CURVE_BANDS} ระดับ`)
  .superRefine((bands, ctx) => {
    const issue = checkCurve(bands);
    if (issue) ctx.addIssue({ code: "custom", message: issue.message });
  })
  .transform((bands) => sortBands(bands));

export const scoreCurveSchema = z.object({
  grades: sectionSchema,
  passFail: sectionSchema,
});

/** ขอบเขตของเกณฑ์กลาง — "system" หรือ id ของคณะ */
export const curveScopeSchema = z.union([z.literal("system"), z.cuid()], "ไม่พบขอบเขตของเกณฑ์");

export const gradingModeSchema = z.enum(GradingMode, "กรุณาเลือกโหมดตัดผล");

export const GRADING_MODE_LABEL: Record<GradingMode, string> = {
  LETTER: "เกรด (A–F)",
  PASS_FAIL: "ผ่าน/ไม่ผ่าน (S/U)",
};

/** ที่มาของเกณฑ์ที่คอร์ส/คณะใช้อยู่ */
export type CurveSource = "course" | "department" | "system";

export const CURVE_SOURCE_LABEL: Record<CurveSource, string> = {
  course: "เกณฑ์ของคอร์สนี้",
  department: "เกณฑ์ของคณะ",
  system: "เกณฑ์ทั้งระบบ",
};
