import { z } from "zod";
import { GradeSource } from "@/generated/prisma/enums";
import { bandsError } from "@/features/gradebook/lib/calc";

/** M09 · FR-09.1–09.3 — สมุดคะแนน (ใช้ร่วม client/server · ข้อความ error ภาษาไทย) */

export const SOURCE_LABEL: Record<GradeSource, string> = {
  [GradeSource.QUIZ]: "แบบทดสอบ",
  [GradeSource.ASSIGNMENT]: "งาน",
  [GradeSource.MANUAL]: "กรอกเอง",
};

const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const MAX_MANUAL_ITEMS = 30;

/** รายการคะแนนแบบกรอกเอง (เช่น เข้าเรียน, สอบปฏิบัติ) */
export const manualItemSchema = z.object({
  title: z.string().trim().min(1, "กรุณาตั้งชื่อรายการ").max(120, "ชื่อรายการยาวได้ไม่เกิน 120 ตัวอักษร"),
  maxScore: z.coerce
    .number("คะแนนเต็มต้องเป็นตัวเลข")
    .positive("คะแนนเต็มต้องมากกว่า 0")
    .max(1000, "คะแนนเต็มได้ไม่เกิน 1,000")
    .refine(twoDecimals, "คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง"),
});

/** น้ำหนักของทุกรายการ บันทึกพร้อมกัน — รวมไม่ถึง 100 ก็บันทึกได้ แต่ยังคำนวณเกรดไม่ได้ */
export const weightsSchema = z
  .array(
    z.object({
      id: z.cuid(),
      weight: z.coerce
        .number("น้ำหนักต้องเป็นตัวเลข")
        .min(0, "น้ำหนักต้องไม่ติดลบ")
        .max(100, "น้ำหนักไม่เกิน 100%")
        .refine(twoDecimals, "น้ำหนักละเอียดได้ไม่เกิน 2 ตำแหน่ง"),
    }),
  )
  .max(200);

export const gradeScaleSchema = z
  .array(
    z.object({
      grade: z.string().trim().min(1, "กรุณาใส่ชื่อเกรด").max(5, "ชื่อเกรดยาวได้ไม่เกิน 5 ตัวอักษร"),
      min: z.coerce
        .number("คะแนนขั้นต่ำต้องเป็นตัวเลข")
        .min(0, "คะแนนขั้นต่ำต้องไม่ติดลบ")
        .max(100, "คะแนนขั้นต่ำไม่เกิน 100")
        .refine(twoDecimals, "คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง"),
    }),
  )
  .max(15, "เกณฑ์มีได้ไม่เกิน 15 ระดับ")
  .superRefine((bands, ctx) => {
    const error = bandsError(bands);
    if (error) ctx.addIssue({ code: "custom", message: error });
  });

/** คะแนนหนึ่งช่องในตาราง — ว่าง = ลบคะแนน */
export const cellScoreSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "คะแนนต้องเป็นตัวเลขที่ไม่ติดลบ")
  .refine((v) => v === null || twoDecimals(v), "คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง");
