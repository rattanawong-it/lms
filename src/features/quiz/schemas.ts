import { z } from "zod";
import { QuestionType, ShowAnswers } from "@/generated/prisma/enums";
import { fromBangkokInput } from "@/lib/dates";

/** M07 · FR-07.3 — ตั้งค่าแบบทดสอบ (ใช้ร่วม client/server) */

export const MAX_QUIZ_QUESTIONS = 200;
export const MAX_POOL_RULES = 10;

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .nullish()
  .transform((v) => v === "on" || v === "true");

/** ช่องตัวเลขที่เว้นว่างได้ — ว่าง = ไม่จำกัด */
const optionalInt = (min: number, max: number, message: string) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), message);

/** `<input type="datetime-local">` ตีความเป็นเวลาไทย · ว่าง = ไม่กำหนด */
const bangkokDateTime = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = fromBangkokInput(v);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "รูปแบบวันเวลาไม่ถูกต้อง" });
      return z.NEVER;
    }
    return date;
  });

export const poolRuleSchema = z.object({
  tag: z.string().trim().min(1, "เลือกแท็กที่จะสุ่ม"),
  count: z.coerce.number().int("จำนวนข้อต้องเป็นจำนวนเต็ม").min(1, "สุ่มอย่างน้อย 1 ข้อ").max(100, "สุ่มได้ไม่เกิน 100 ข้อต่อแท็ก"),
});

export const quizSettingsSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณาตั้งชื่อแบบทดสอบ").max(200, "ชื่อแบบทดสอบยาวได้ไม่เกิน 200 ตัวอักษร"),
    lessonId: z
      .string()
      .nullish()
      .transform((v) => (v && v !== "none" ? v : null)),
    timeLimitMin: optionalInt(1, 600, "เวลาทำต้องอยู่ระหว่าง 1–600 นาที"),
    maxAttempts: optionalInt(1, 100, "จำนวนครั้งต้องอยู่ระหว่าง 1–100"),
    shuffleQuestions: checkbox,
    shuffleChoices: checkbox,
    passingPct: z.coerce
      .number("คะแนนผ่านต้องเป็นตัวเลข")
      .int("คะแนนผ่านต้องเป็นจำนวนเต็ม")
      .min(0, "คะแนนผ่านต้องไม่ติดลบ")
      .max(100, "คะแนนผ่านสูงสุดคือ 100%"),
    showAnswers: z.enum(ShowAnswers, "เลือกเวลาที่จะแสดงเฉลย"),
    availableFrom: bangkokDateTime,
    availableUntil: bangkokDateTime,
    questionIds: z.array(z.string()).max(MAX_QUIZ_QUESTIONS, `เลือกข้อสอบได้ไม่เกิน ${MAX_QUIZ_QUESTIONS} ข้อ`),
    pool: z.array(poolRuleSchema).max(MAX_POOL_RULES, `กฎการสุ่มมีได้ไม่เกิน ${MAX_POOL_RULES} ข้อ`),
  })
  .superRefine((q, ctx) => {
    if (q.availableFrom && q.availableUntil && q.availableUntil <= q.availableFrom) {
      ctx.addIssue({ code: "custom", path: ["availableUntil"], message: "เวลาปิดต้องหลังเวลาเปิด" });
    }
    if (new Set(q.questionIds).size !== q.questionIds.length) {
      ctx.addIssue({ code: "custom", path: ["questionIds"], message: "เลือกข้อสอบซ้ำ" });
    }
    if (new Set(q.pool.map((r) => r.tag)).size !== q.pool.length) {
      ctx.addIssue({ code: "custom", path: ["pool"], message: "มีกฎสุ่มจากแท็กเดียวกันซ้ำ" });
    }
    if (q.questionIds.length === 0 && q.pool.length === 0) {
      ctx.addIssue({ code: "custom", path: ["questionIds"], message: "เลือกข้อสอบหรือกำหนดการสุ่มจากแท็กอย่างน้อย 1 อย่าง" });
    }
    if (q.showAnswers === ShowAnswers.AFTER_CLOSE && !q.availableUntil) {
      ctx.addIssue({
        code: "custom",
        path: ["showAnswers"],
        message: "“แสดงเฉลยหลังปิดแบบทดสอบ” ต้องกำหนดเวลาปิดด้วย",
      });
    }
  });

export type QuizSettings = z.output<typeof quizSettingsSchema>;

/* ─────────── คำตอบของผู้เรียน (FR-07.5) ─────────── */

export const SHORT_TEXT_MAX = 200;
export const ESSAY_MAX = 10_000;

/** ตรวจรูปคำตอบตามชนิดข้อ — ค่าที่อยู่ในรูปถูกแต่ id ไม่อยู่ใน snapshot ตรวจแยกใน actions */
export function responseSchemaFor(type: QuestionType) {
  switch (type) {
    case QuestionType.SINGLE:
    case QuestionType.TRUE_FALSE:
      return z.object({ choiceId: z.string().min(1) });
    case QuestionType.MULTIPLE:
      return z.object({ choiceIds: z.array(z.string()).max(20) });
    case QuestionType.MATCHING:
      return z.object({ pairs: z.record(z.string(), z.string().max(500)) });
    case QuestionType.SHORT_TEXT:
      return z.object({ text: z.string().max(SHORT_TEXT_MAX, `คำตอบยาวได้ไม่เกิน ${SHORT_TEXT_MAX} ตัวอักษร`) });
    case QuestionType.ESSAY:
      return z.object({ text: z.string().max(ESSAY_MAX, `คำตอบยาวได้ไม่เกิน ${ESSAY_MAX.toLocaleString("th-TH")} ตัวอักษร`) });
  }
}

/* ─────────── ผู้สอนตรวจคำตอบ (FR-07.4) ─────────── */

export const FEEDBACK_MAX = 2_000;

/**
 * คะแนน (เฉพาะข้ออัตนัย — ช่องว่าง = ยังไม่ให้คะแนน) + feedback รายข้อ
 * ช่วงคะแนนขึ้นกับคะแนนเต็มของข้อใน snapshot จึงตรวจต่อใน actions ด้วย `essayScoreError()`
 */
export const reviewAnswerSchema = z.object({
  score: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), "คะแนนต้องเป็นตัวเลข"),
  feedback: z
    .string()
    .nullish()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || v.length <= FEEDBACK_MAX, `ความเห็นยาวได้ไม่เกิน ${FEEDBACK_MAX.toLocaleString("th-TH")} ตัวอักษร`),
});

