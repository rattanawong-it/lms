import { z } from "zod";
import { EnrollPolicy, LessonType, VideoSource, Visibility } from "@/generated/prisma/enums";

/** M04 — ตรวจข้อมูลคอร์ส Section และ Lesson (ใช้ร่วม client/server) */

/**
 * ช่องเลือกที่ไม่บังคับ
 *
 * ต้องรับ `null` ด้วย ไม่ใช่แค่ `undefined` เพราะ `formData.get()` คืน `null`
 * เมื่อฟอร์มไม่มีช่องนั้นเลย (เช่น ผู้สอนธรรมดาไม่เห็นช่องเลือกคณะ)
 */
const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null || v === "" || v === "none" ? null : v));

export const courseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "ชื่อคอร์สต้องยาวอย่างน้อย 3 ตัวอักษร")
    .max(200, "ชื่อคอร์สยาวเกินไป (ไม่เกิน 200 ตัวอักษร)"),
  slug: z
    .string()
    .trim()
    .min(3, "slug ต้องยาวอย่างน้อย 3 ตัวอักษร")
    .max(100, "slug ยาวเกินไป (ไม่เกิน 100 ตัวอักษร)")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug ใช้ได้เฉพาะ a-z 0-9 และ - คั่นคำ")
    .transform((v) => v.toLowerCase()),
  summary: z
    .string()
    .trim()
    .max(400, "คำโปรยยาวเกินไป (ไม่เกิน 400 ตัวอักษร)")
    .nullish()
    .transform((v) => (v ? v : null)),
  level: z
    .string()
    .trim()
    .max(60, "ระดับยาวเกินไป")
    .nullish()
    .transform((v) => (v ? v : null)),
  visibility: z.enum(Visibility),
  enrollPolicy: z.enum(EnrollPolicy),
  sequential: z.coerce.boolean().default(false),
  /** FR-15.9 — ปิดการป้องกันเนื้อหาเฉพาะคอร์สนี้ได้ (ระดับระบบเป็นอีกสวิตช์หนึ่ง) */
  protectionEnabled: z.coerce.boolean().default(true),
  categoryId: optionalId,
  departmentId: optionalId,
  /** FR-05.1 — รหัส Asset ของภาพปกที่อัปโหลดไว้แล้ว (ค่าว่าง = ไม่มีปก) */
  coverAssetId: optionalId,
});
export type CourseInput = z.input<typeof courseSchema>;

export const courseUpdateSchema = courseSchema.extend({
  id: z.cuid("ไม่พบคอร์สที่ต้องการแก้ไข"),
});

/** FR-04.7 — เงื่อนไขการจบคอร์ส เก็บเป็น JSON ใน Course.completionRule */
export const completionRuleSchema = z.object({
  minProgress: z.coerce
    .number()
    .int("กรอกเป็นจำนวนเต็ม")
    .min(1, "ต้องเรียนอย่างน้อย 1%")
    .max(100, "มากที่สุดคือ 100%"),
  requireQuizPass: z.coerce.boolean().default(false),
  minScore: z.coerce
    .number()
    .min(0, "คะแนนขั้นต่ำต้องไม่ติดลบ")
    .max(100, "คะแนนขั้นต่ำมากที่สุดคือ 100")
    .nullable()
    .default(null),
});
export type CompletionRule = z.output<typeof completionRuleSchema>;

export const DEFAULT_COMPLETION_RULE: CompletionRule = {
  minProgress: 100,
  requireQuizPass: false,
  minScore: null,
};

/** อ่านค่า completionRule จาก DB ที่อาจเป็นรูปแบบเก่าหรือว่างเปล่า */
export function parseCompletionRule(value: unknown): CompletionRule {
  const parsed = completionRuleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_COMPLETION_RULE;
}

export const sectionSchema = z.object({
  courseId: z.cuid(),
  title: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อบท")
    .max(200, "ชื่อบทยาวเกินไป (ไม่เกิน 200 ตัวอักษร)"),
});

export const sectionUpdateSchema = sectionSchema.omit({ courseId: true }).extend({
  id: z.cuid("ไม่พบบทที่ต้องการแก้ไข"),
});

/**
 * FR-04.3 — บทเรียน
 * ฟิลด์ที่ต้องกรอกขึ้นกับชนิด จึงตรวจด้วย superRefine แทนการบังคับทุกช่อง
 */
export const lessonSchema = z
  .object({
    sectionId: z.cuid(),
    title: z
      .string()
      .trim()
      .min(1, "กรุณากรอกชื่อบทเรียน")
      .max(200, "ชื่อบทเรียนยาวเกินไป (ไม่เกิน 200 ตัวอักษร)"),
    type: z.enum(LessonType),
    isPreview: z.coerce.boolean().default(false),
    videoSource: z
      .enum(VideoSource)
      .nullish()
      .transform((v) => v ?? null),
    videoUrl: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
    durationSec: z
      .union([z.coerce.number().int().min(0).max(24 * 60 * 60), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v == null ? null : Number(v))),
    liveUrl: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
    liveStartAt: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? new Date(v) : null)),
    liveEndAt: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? new Date(v) : null)),
    /** FR-05.5 — ลิงก์วิดีโอบันทึกย้อนหลังของคาบเรียนสด */
    recordingUrl: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
    /** FR-05.1 — ไฟล์ที่อัปโหลดไว้แล้วสำหรับบทเรียนวิดีโอ (UPLOAD) และ PDF */
    assetId: optionalId,
  })
  .superRefine((data, ctx) => {
    if (data.type === LessonType.VIDEO) {
      if (!data.videoSource) {
        ctx.addIssue({
          code: "custom",
          path: ["videoSource"],
          message: "เลือกที่มาของวิดีโอ",
        });
      }
      if (data.videoSource === VideoSource.UPLOAD && !data.assetId) {
        ctx.addIssue({
          code: "custom",
          path: ["assetId"],
          message: "อัปโหลดไฟล์วิดีโอก่อน",
        });
      }
      if (data.videoSource !== VideoSource.UPLOAD && !data.videoUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "กรอกลิงก์วิดีโอ",
        });
      }
      if (data.videoUrl && !isEmbeddableVideoUrl(data.videoUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "รองรับเฉพาะลิงก์ YouTube และ Vimeo",
        });
      }
    }

    if (data.type === LessonType.PDF && !data.assetId) {
      ctx.addIssue({ code: "custom", path: ["assetId"], message: "อัปโหลดไฟล์ PDF ก่อน" });
    }

    if (data.type === LessonType.LIVE) {
      if (data.recordingUrl && !isHttpUrl(data.recordingUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["recordingUrl"],
          message: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://",
        });
      }
      if (!data.liveUrl) {
        ctx.addIssue({ code: "custom", path: ["liveUrl"], message: "กรอกลิงก์ห้องเรียนสด" });
      } else if (!isHttpUrl(data.liveUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["liveUrl"],
          message: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://",
        });
      }
      if (!data.liveStartAt || Number.isNaN(data.liveStartAt.getTime())) {
        ctx.addIssue({ code: "custom", path: ["liveStartAt"], message: "เลือกวันและเวลาที่เริ่ม" });
      }
      if (
        data.liveStartAt &&
        data.liveEndAt &&
        !Number.isNaN(data.liveEndAt.getTime()) &&
        data.liveEndAt <= data.liveStartAt
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["liveEndAt"],
          message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
        });
      }
    }
  });

export const lessonUpdateSchema = z.object({ id: z.cuid("ไม่พบบทเรียนที่ต้องการแก้ไข") });

/** FR-05.7 — ไฟล์ประกอบบทเรียน พร้อมธงว่าอนุญาตให้ดาวน์โหลดหรือไม่ */
export const attachmentSchema = z.object({
  lessonId: z.cuid("ไม่พบบทเรียน"),
  assetId: z.cuid("ไม่พบไฟล์ที่แนบ"),
  downloadable: z.coerce.boolean().default(false),
});

export const attachmentUpdateSchema = z.object({
  id: z.cuid("ไม่พบไฟล์ประกอบ"),
  downloadable: z.coerce.boolean().default(false),
});

export const attachmentRemoveSchema = z.object({ id: z.cuid("ไม่พบไฟล์ประกอบ") });

/** ลิงก์ต้องเป็น http/https เท่านั้น — กัน javascript: และ data: */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * FR-05.2 — รองรับ embed เฉพาะ YouTube และ Vimeo
 * โดเมนที่อนุญาตต้องตรงกับ CSP frame-src ที่จะตั้งในขั้น 6
 */
const VIDEO_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
];

export function isEmbeddableVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return VIDEO_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** FR-04.2 — บันทึกลำดับใหม่หลังลากวาง */
export const reorderSchema = z.object({
  courseId: z.cuid(),
  kind: z.enum(["section", "lesson"]),
  /** id เรียงตามลำดับใหม่ */
  ids: z.array(z.cuid()).min(1, "ไม่มีรายการให้จัดลำดับ"),
  /** ใช้เฉพาะตอนเรียงบทเรียน — บทที่รายการนี้อยู่ */
  sectionId: z.cuid().optional(),
});

/** FR-04.5 — ผู้สอนร่วม */
export const instructorSchema = z.object({
  courseId: z.cuid(),
  email: z.email("รูปแบบอีเมลไม่ถูกต้อง").trim().toLowerCase(),
});

export const instructorRemoveSchema = z.object({
  courseId: z.cuid(),
  userId: z.cuid(),
});

/** FR-04.6 — เปลี่ยนสถานะคอร์ส */
export const COURSE_TRANSITIONS = [
  "submit",
  "approve",
  "reject",
  "unpublish",
  "archive",
  "restore",
] as const;
export type CourseTransition = (typeof COURSE_TRANSITIONS)[number];

export const transitionSchema = z.object({
  courseId: z.cuid(),
  transition: z.enum(COURSE_TRANSITIONS),
  note: z
    .string()
    .trim()
    .max(500, "เหตุผลยาวเกินไป (ไม่เกิน 500 ตัวอักษร)")
    .nullish()
    .transform((v) => (v ? v : null)),
});
