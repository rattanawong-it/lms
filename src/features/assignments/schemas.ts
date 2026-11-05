import { z } from "zod";
import { UPLOAD_RULES } from "@/lib/upload-limits";
import { parseRichTextField, richTextLength, type RichTextDoc } from "@/lib/rich-text-doc";
import { SubmissionMode } from "@/generated/prisma/enums";
import { bangkokDateTime, checkbox } from "@/features/quiz/schemas";

/** M08 · FR-08.1 / FR-08.2 / FR-08.4 — งานที่ต้องส่ง (ใช้ร่วม client/server) */

/**
 * นามสกุลที่ผู้สอนเลือกให้ส่งได้ → MIME ที่ระบบรับ
 * ทุกชนิดอยู่ในกติกา `FILE` ของ `lib/upload-limits.ts` และตรวจ magic bytes ได้ตาม `lib/file-type.ts`
 */
export const SUBMISSION_FILE_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
} as const satisfies Record<string, (typeof UPLOAD_RULES.FILE.mimes)[number]>;

export type SubmissionFileType = keyof typeof SUBMISSION_FILE_TYPES;
export const SUBMISSION_FILE_TYPE_KEYS = Object.keys(SUBMISSION_FILE_TYPES) as SubmissionFileType[];
export const DEFAULT_FILE_TYPES: SubmissionFileType[] = ["pdf", "docx", "zip"];

/** เพดานขนาดต่อไฟล์ = เพดานของไฟล์ชนิด FILE ทั้งระบบ */
export const MAX_SUBMISSION_FILE_MB = Math.floor(UPLOAD_RULES.FILE.maxSize / (1024 * 1024));
export const MAX_SUBMISSION_FILES = 10;
export const SUBMISSION_TEXT_MAX = 20_000;
export const GRADE_FEEDBACK_MAX = 5_000;

/** FR-08.1 · CHANGELOG #53 — ช่องทางส่งงานที่ผู้สอนเลือก */
export const SUBMISSION_MODE_LABEL: Record<SubmissionMode, { label: string; hint: string }> = {
  [SubmissionMode.TEXT_OR_FILE]: { label: "ข้อความหรือไฟล์", hint: "ผู้เรียนพิมพ์คำตอบ แนบไฟล์ หรือทั้งสองอย่าง" },
  [SubmissionMode.TEXT]: { label: "ข้อความอย่างเดียว", hint: "ผู้เรียนพิมพ์คำตอบในกล่องข้อความ ไม่มีช่องแนบไฟล์" },
  [SubmissionMode.FILE]: { label: "ไฟล์อย่างเดียว", hint: "ผู้เรียนแนบไฟล์อย่างน้อย 1 ไฟล์ ไม่มีกล่องข้อความ" },
};
export const SUBMISSION_MODES = Object.keys(SUBMISSION_MODE_LABEL) as SubmissionMode[];

/** งานโหมดนี้รับข้อความ / รับไฟล์ไหม */
export function acceptsText(mode: SubmissionMode): boolean {
  return mode !== SubmissionMode.FILE;
}
export function acceptsFiles(mode: SubmissionMode): boolean {
  return mode !== SubmissionMode.TEXT;
}

export const assignmentSettingsSchema = z.object({
  title: z.string().trim().min(1, "กรุณาตั้งชื่องาน").max(200, "ชื่องานยาวได้ไม่เกิน 200 ตัวอักษร"),
  lessonId: z
    .string()
    .nullish()
    .transform((v) => (v && v !== "none" ? v : null)),
  dueAt: bangkokDateTime,
  allowLate: checkbox,
  maxScore: z.coerce
    .number("คะแนนเต็มต้องเป็นตัวเลข")
    .positive("คะแนนเต็มต้องมากกว่า 0")
    .max(1000, "คะแนนเต็มได้ไม่เกิน 1,000")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง"),
  submissionMode: z.enum(SubmissionMode, "เลือกช่องทางส่งงาน").default(SubmissionMode.TEXT_OR_FILE),
  allowedTypes: z
    .array(z.enum(SUBMISSION_FILE_TYPE_KEYS as [SubmissionFileType, ...SubmissionFileType[]], "ชนิดไฟล์ไม่ถูกต้อง"))
    .transform((v) => [...new Set(v)]),
  maxFileMb: z.coerce
    .number("ขนาดไฟล์ต้องเป็นตัวเลข")
    .int("ขนาดไฟล์ต้องเป็นจำนวนเต็ม")
    .min(1, "ขนาดไฟล์อย่างน้อย 1 MB")
    .max(MAX_SUBMISSION_FILE_MB, `ขนาดไฟล์ได้ไม่เกิน ${MAX_SUBMISSION_FILE_MB} MB`),
}).superRefine((v, ctx) => {
  // โหมดข้อความอย่างเดียวไม่ต้องเลือกชนิดไฟล์ (ค่าที่ติ๊กค้างไว้ถูกเก็บตามเดิม เผื่อสลับกลับ)
  if (acceptsFiles(v.submissionMode) && v.allowedTypes.length === 0) {
    ctx.addIssue({ code: "custom", path: ["allowedTypes"], message: "เลือกชนิดไฟล์ที่รับอย่างน้อย 1 ชนิด" });
  }
});

export type AssignmentSettings = z.output<typeof assignmentSettingsSchema>;

/**
 * ผู้เรียนส่งงาน — ตามช่องทางที่ผู้สอนเปิด (CHANGELOG #53)
 * ข้อความเป็น Tiptap JSON ผ่าน allowlist ชุดผู้เรียน (`media: false` — ไม่มีรูป/YouTube)
 * · ช่องที่โหมดไม่รับถูกปฏิเสธ ไม่ใช่ทิ้งเงียบ ๆ (หน้าจอไม่แสดงช่องนั้นอยู่แล้ว)
 */
export function submitAssignmentSchema(mode: SubmissionMode) {
  return z
    .object({
      content: z
        .string()
        .nullish()
        .transform((v): RichTextDoc | null => parseRichTextField(v ?? null, { media: false }))
        .refine(
          (v) => v === null || richTextLength(v) <= SUBMISSION_TEXT_MAX,
          `ข้อความยาวได้ไม่เกิน ${SUBMISSION_TEXT_MAX.toLocaleString("th-TH")} ตัวอักษร`,
        ),
      assetIds: z
        .array(z.cuid("ไฟล์ไม่ถูกต้อง"))
        .max(MAX_SUBMISSION_FILES, `แนบไฟล์ได้ไม่เกิน ${MAX_SUBMISSION_FILES} ไฟล์`)
        .transform((v) => [...new Set(v)]),
    })
    .superRefine((v, ctx) => {
      if (!acceptsText(mode) && v.content) {
        ctx.addIssue({ code: "custom", path: ["content"], message: "งานนี้รับเฉพาะไฟล์" });
      } else if (!acceptsFiles(mode) && v.assetIds.length > 0) {
        ctx.addIssue({ code: "custom", path: ["files"], message: "งานนี้รับเฉพาะข้อความ" });
      } else if (mode === SubmissionMode.TEXT && !v.content) {
        ctx.addIssue({ code: "custom", path: ["content"], message: "พิมพ์คำตอบก่อนส่ง" });
      } else if (mode === SubmissionMode.FILE && v.assetIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["files"], message: "แนบไฟล์อย่างน้อย 1 ไฟล์" });
      } else if (!v.content && v.assetIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["content"], message: "พิมพ์คำตอบหรือแนบไฟล์อย่างน้อยหนึ่งอย่าง" });
      }
    });
}

/** ผู้สอนตรวจ: ให้คะแนน หรือส่งกลับให้แก้ (ความเห็นบังคับเมื่อส่งกลับ) */
export const gradeSubmissionSchema = z
  .object({
    decision: z.enum(["grade", "return"], "เลือกผลการตรวจ"),
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
      .refine((v) => v === null || v.length <= GRADE_FEEDBACK_MAX, `ความเห็นยาวได้ไม่เกิน ${GRADE_FEEDBACK_MAX.toLocaleString("th-TH")} ตัวอักษร`),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "grade" && v.score === null) {
      ctx.addIssue({ code: "custom", path: ["score"], message: "กรอกคะแนน" });
    }
    if (v.decision === "return" && !v.feedback) {
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "บอกผู้เรียนว่าต้องแก้อะไร" });
    }
  });
