import { z } from "zod";
import { QuestionType } from "@/generated/prisma/enums";

/**
 * M07 · FR-07.1 / FR-07.2 — ตรวจข้อสอบในคลัง (ใช้ร่วม client/server และตัวนำเข้า FR-07.7)
 *
 * รูปแบบการเก็บเฉลยของแต่ละชนิด (phase-2-plan ขั้น 1 — ไม่แก้ schema):
 *   SINGLE / TRUE_FALSE — Choice.isCorrect 1 ตัว
 *   MULTIPLE            — Choice.isCorrect ≥ 1 ตัว
 *   MATCHING            — Choice.text = ฝั่งซ้าย · Choice.matchKey = คำตอบฝั่งขวา
 *   SHORT_TEXT          — Choice ทุกตัวคือคำตอบที่ยอมรับ (isCorrect = true)
 *   ESSAY               — ไม่มี Choice
 */

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  [QuestionType.SINGLE]: "ปรนัยตอบเดียว",
  [QuestionType.MULTIPLE]: "หลายคำตอบ",
  [QuestionType.TRUE_FALSE]: "ถูก/ผิด",
  [QuestionType.MATCHING]: "จับคู่",
  [QuestionType.SHORT_TEXT]: "เติมคำสั้น",
  [QuestionType.ESSAY]: "อัตนัย (ตรวจเอง)",
};

/** ตัวเลือกของข้อถูก/ผิด — ตายตัวเสมอ ผู้สอนเลือกแค่ว่าข้อไหนถูก */
export const TRUE_FALSE_CHOICES = ["ถูก", "ผิด"] as const;

export const MAX_CHOICES = 10;
export const MAX_MATCHING_PAIRS = 12;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;
export const MAX_CHOICE_LENGTH = 500;
export const MIN_POINTS = 0.25;
export const MAX_POINTS = 1000;

export const choiceSchema = z.object({
  /** id เดิมของตัวเลือกตอนแก้ไข — คงไว้ให้คำตอบเก่าที่อ้างถึงยังชี้ถูกตัว */
  id: z.string().optional(),
  text: z
    .string()
    .trim()
    .min(1, "ตัวเลือกต้องไม่ว่าง")
    .max(MAX_CHOICE_LENGTH, `ตัวเลือกยาวได้ไม่เกิน ${MAX_CHOICE_LENGTH} ตัวอักษร`),
  isCorrect: z.boolean(),
  matchKey: z
    .string()
    .trim()
    .max(MAX_CHOICE_LENGTH, `คำตอบฝั่งขวายาวได้ไม่เกิน ${MAX_CHOICE_LENGTH} ตัวอักษร`)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type ChoiceInput = z.output<typeof choiceSchema>;

/** แท็กจากช่องข้อความ "บทที่ 1, พื้นฐาน" หรืออาร์เรย์ — ตัดช่องว่าง ตัดซ้ำ */
export const tagsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => {
    const list = Array.isArray(v) ? v : (v ?? "").split(/[,|]/);
    return [...new Set(list.map((t) => t.trim()).filter(Boolean))];
  })
  .pipe(
    z
      .array(z.string().max(MAX_TAG_LENGTH, `แท็กยาวได้ไม่เกิน ${MAX_TAG_LENGTH} ตัวอักษร`))
      .max(MAX_TAGS, `ใส่แท็กได้ไม่เกิน ${MAX_TAGS} แท็ก`),
  );

export const pointsSchema = z.coerce
  .number("คะแนนต้องเป็นตัวเลข")
  .min(MIN_POINTS, `คะแนนต่อข้อต้องไม่น้อยกว่า ${MIN_POINTS}`)
  .max(MAX_POINTS, `คะแนนต่อข้อต้องไม่เกิน ${MAX_POINTS}`)
  .refine((n) => Math.round(n * 100) === n * 100, "คะแนนมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง");

/**
 * ส่วนของข้อสอบที่ไม่ใช่ rich text — โจทย์และคำอธิบายเฉลยผ่าน `parseRichTextDoc()` แยก
 * เพราะต้องทำความสะอาดฝั่ง server ไม่ใช่แค่ตรวจรูปแบบ
 */
export const questionBodySchema = z
  .object({
    type: z.enum(QuestionType, "กรุณาเลือกชนิดข้อสอบ"),
    points: pointsSchema,
    tags: tagsSchema,
    choices: z.array(choiceSchema).default([]),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["choices"], message });
    const correct = q.choices.filter((c) => c.isCorrect).length;

    switch (q.type) {
      case QuestionType.SINGLE:
      case QuestionType.MULTIPLE:
        if (q.choices.length < 2) return issue("ต้องมีตัวเลือกอย่างน้อย 2 ตัว");
        if (q.choices.length > MAX_CHOICES) return issue(`มีตัวเลือกได้ไม่เกิน ${MAX_CHOICES} ตัว`);
        if (new Set(q.choices.map((c) => c.text)).size !== q.choices.length) {
          return issue("มีตัวเลือกที่ข้อความซ้ำกัน");
        }
        if (q.type === QuestionType.SINGLE && correct !== 1) {
          return issue("ข้อปรนัยตอบเดียวต้องเลือกคำตอบที่ถูก 1 ตัว");
        }
        if (q.type === QuestionType.MULTIPLE && correct < 1) {
          return issue("ต้องเลือกคำตอบที่ถูกอย่างน้อย 1 ตัว");
        }
        return;

      case QuestionType.TRUE_FALSE:
        if (
          q.choices.length !== 2 ||
          q.choices.some((c, i) => c.text !== TRUE_FALSE_CHOICES[i]) ||
          correct !== 1
        ) {
          return issue("ข้อถูก/ผิดต้องเลือกว่าคำตอบคือ “ถูก” หรือ “ผิด”");
        }
        return;

      case QuestionType.MATCHING:
        if (q.choices.length < 2) return issue("ข้อจับคู่ต้องมีอย่างน้อย 2 คู่");
        if (q.choices.length > MAX_MATCHING_PAIRS) {
          return issue(`ข้อจับคู่มีได้ไม่เกิน ${MAX_MATCHING_PAIRS} คู่`);
        }
        if (q.choices.some((c) => !c.matchKey)) return issue("ทุกคู่ต้องมีคำตอบฝั่งขวา");
        if (new Set(q.choices.map((c) => c.text)).size !== q.choices.length) {
          return issue("ข้อความฝั่งซ้ายต้องไม่ซ้ำกัน");
        }
        return;

      case QuestionType.SHORT_TEXT:
        if (q.choices.length < 1) return issue("ต้องมีคำตอบที่ยอมรับอย่างน้อย 1 คำตอบ");
        if (q.choices.length > MAX_CHOICES) return issue(`คำตอบที่ยอมรับมีได้ไม่เกิน ${MAX_CHOICES} แบบ`);
        if (q.choices.some((c) => !c.isCorrect)) return issue("คำตอบของข้อเติมคำต้องเป็นคำตอบที่ถูกทั้งหมด");
        return;

      case QuestionType.ESSAY:
        if (q.choices.length > 0) return issue("ข้ออัตนัยไม่มีตัวเลือก");
        return;
    }
  });

export type QuestionBody = z.output<typeof questionBodySchema>;

/** ตัวกรองของหน้าคลังข้อสอบ — อ่านจาก query string (ค่าที่แก้มือไม่ทำให้หน้าพัง) */
export const questionFilterSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  type: z.enum(QuestionType).optional().catch(undefined),
  tag: z.string().trim().max(MAX_TAG_LENGTH).optional().catch(undefined),
  archived: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export type QuestionFilter = z.output<typeof questionFilterSchema>;

export const QUESTION_PAGE_SIZE = 30;

/** เพดานของการนำเข้า (FR-07.7) — server action รับ body ได้ราว 1 MB */
export const IMPORT_MAX_BYTES = 900 * 1024;
export const IMPORT_MAX_ROWS = 500;
