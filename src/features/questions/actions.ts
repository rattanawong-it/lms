"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCourseAccess, requireCourseCreator } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { parseRichTextField } from "@/lib/rich-text-doc";
import { parseCsv, toCsv } from "@/lib/csv";
import { readXlsxRows, toXlsx } from "@/lib/xlsx";
import type { QuestionType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { IMPORT_MAX_BYTES, questionBodySchema } from "@/features/questions/schemas";
import {
  parseQuestionTable,
  QUESTION_TEMPLATE_ROWS,
  type ImportedQuestion,
} from "@/features/questions/lib/import";

/**
 * M07 · FR-07.1 / FR-07.2 / FR-07.7 — เขียนคลังข้อสอบ
 * parse ด้วย Zod → ตรวจสิทธิ์ตามคอร์สที่ข้อสอบสังกัดจริง → เขียน DB → AuditLog → revalidate
 */

const idSchema = z.cuid("ไม่พบข้อสอบ");

function revalidateBank(courseId: string) {
  revalidatePath(`/teach/courses/${courseId}/questions`);
}

/** ตัวเลือกส่งมาเป็น JSON string ของอาร์เรย์ — JSON เสียถือว่าไม่มีตัวเลือก */
function readChoices(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** อ่านฟอร์มข้อสอบ · `type` ส่งมาเองตอนสร้าง แต่ตอนแก้ไขใช้ชนิดเดิมใน DB เสมอ */
function readQuestionForm(formData: FormData, type: FormDataEntryValue | null) {
  const body = questionBodySchema.safeParse({
    type,
    points: formData.get("points"),
    tags: formData.get("tags"),
    choices: readChoices(formData.get("choices")),
  });
  const prompt = parseRichTextField(formData.get("prompt"));
  const explanation = parseRichTextField(formData.get("explanation"));

  if (!body.success || !prompt) {
    return {
      error: {
        ok: false,
        message: "กรุณาตรวจสอบข้อมูลข้อสอบอีกครั้ง",
        fieldErrors: {
          ...(body.success ? {} : zodToFieldErrors(body.error)),
          ...(prompt ? {} : { prompt: "กรุณาเขียนโจทย์" }),
        },
      } satisfies ActionResult,
    };
  }
  return { data: { ...body.data, prompt, explanation } };
}

export async function createQuestion(formData: FormData): Promise<ActionResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const { data, error } = readQuestionForm(formData, formData.get("type"));
  if (error) return error;

  const question = await db.question.create({
    data: {
      courseId: courseId.data,
      type: data.type,
      prompt: data.prompt,
      explanation: data.explanation ?? undefined,
      points: data.points,
      tags: data.tags,
      choices: {
        create: data.choices.map((c, position) => ({
          text: c.text,
          isCorrect: c.isCorrect,
          matchKey: c.matchKey,
          position,
        })),
      },
    },
    select: { id: true },
  });

  await writeAudit({
    actorId: user.id,
    action: "question.create",
    entity: "Question",
    entityId: question.id,
    after: { courseId: courseId.data, type: data.type, points: data.points, tags: data.tags },
  });

  revalidateBank(courseId.data);
  return { ok: true, message: "เพิ่มข้อสอบเข้าคลังแล้ว" };
}

/** โหลดข้อสอบแล้วตรวจสิทธิ์ตามคอร์สที่ข้อสอบสังกัดจริง (ไม่เชื่อ courseId จากฟอร์ม) */
async function loadQuestion(id: string) {
  const question = await db.question.findUnique({
    where: { id },
    select: {
      id: true,
      courseId: true,
      type: true,
      points: true,
      tags: true,
      archivedAt: true,
      choices: { select: { id: true } },
    },
  });
  if (!question) return null;
  const access = await assertCourseAccess(question.courseId, "teach");
  return { question, user: access.user };
}

export async function updateQuestion(formData: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "ไม่พบข้อสอบ" };
  const loaded = await loadQuestion(id.data);
  if (!loaded) return { ok: false, message: "ไม่พบข้อสอบ" };
  const { question, user } = loaded;

  const { data, error } = readQuestionForm(formData, question.type);
  if (error) return error;

  // คง id ของตัวเลือกเดิมไว้ — คำตอบของผู้เรียน (ขั้น 2) อ้างถึงตัวเลือกด้วย id
  const existingIds = new Set(question.choices.map((c) => c.id));
  const kept = data.choices.filter((c) => c.id && existingIds.has(c.id));
  const keptIds = new Set(kept.map((c) => c.id!));

  await db.$transaction([
    db.choice.deleteMany({ where: { questionId: question.id, id: { notIn: [...keptIds] } } }),
    ...data.choices.map((c, position) =>
      c.id && keptIds.has(c.id)
        ? db.choice.update({
            where: { id: c.id },
            data: { text: c.text, isCorrect: c.isCorrect, matchKey: c.matchKey, position },
          })
        : db.choice.create({
            data: {
              questionId: question.id,
              text: c.text,
              isCorrect: c.isCorrect,
              matchKey: c.matchKey,
              position,
            },
          }),
    ),
    db.question.update({
      where: { id: question.id },
      data: {
        prompt: data.prompt,
        explanation: data.explanation ?? Prisma.DbNull,
        points: data.points,
        tags: data.tags,
      },
    }),
  ]);

  await writeAudit({
    actorId: user.id,
    action: "question.update",
    entity: "Question",
    entityId: question.id,
    before: { points: question.points.toString(), tags: question.tags },
    after: { points: data.points, tags: data.tags, choices: data.choices.length },
  });

  revalidateBank(question.courseId);
  return { ok: true, message: "บันทึกการแก้ไขข้อสอบแล้ว" };
}

/**
 * เก็บเข้าคลัง / นำกลับมาใช้ — ไม่ลบจริง (CHANGELOG #20 · S1)
 * เพราะ `Answer.question` เป็น cascade: ลบข้อสอบ = ลบคำตอบเก่าของผู้เรียนทุกคนที่เคยสอบข้อนี้
 */
export async function setQuestionArchived(formData: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "ไม่พบข้อสอบ" };
  const archived = formData.get("archived") === "true";

  const loaded = await loadQuestion(id.data);
  if (!loaded) return { ok: false, message: "ไม่พบข้อสอบ" };
  const { question, user } = loaded;

  await db.question.update({
    where: { id: question.id },
    data: { archivedAt: archived ? new Date() : null },
  });

  await writeAudit({
    actorId: user.id,
    action: archived ? "question.archive" : "question.restore",
    entity: "Question",
    entityId: question.id,
  });

  revalidateBank(question.courseId);
  return {
    ok: true,
    message: archived ? "เก็บข้อสอบเข้าคลังเก่าแล้ว — นำกลับมาใช้ได้ทุกเมื่อ" : "นำข้อสอบกลับมาใช้แล้ว",
  };
}

// ───────────── FR-07.7 นำเข้าจาก CSV / Excel ─────────────

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** อ่านไฟล์ที่อัปโหลดเป็นตาราง — แยก CSV/XLSX จากนามสกุล และตรวจ magic bytes ของ .xlsx */
async function readTable(file: FormDataEntryValue | null): Promise<string[][] | string> {
  if (!(file instanceof File) || file.size === 0) return "ยังไม่ได้เลือกไฟล์ หรือไฟล์ว่าง";
  if (file.size > IMPORT_MAX_BYTES) return "ไฟล์ใหญ่เกิน 900 KB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละส่วน";

  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    const data = await file.arrayBuffer();
    const head = new Uint8Array(data.slice(0, 4));
    if (!ZIP_MAGIC.every((byte, i) => head[i] === byte)) return "ไฟล์ .xlsx เสียหรือไม่ใช่ไฟล์ Excel จริง";
    try {
      return await readXlsxRows(data);
    } catch {
      return "อ่านไฟล์ Excel ไม่ได้ — ลองบันทึกใหม่เป็น .xlsx หรือใช้ไฟล์แม่แบบของระบบ";
    }
  }
  return "รองรับเฉพาะไฟล์ .csv และ .xlsx";
}

export type ImportPreviewRow = {
  line: number;
  ok: boolean;
  preview: string;
  type: QuestionType | null;
  error: string | null;
};

export type QuestionImportPreview = {
  ok: boolean;
  message: string;
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
};

async function parseUpload(formData: FormData) {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { error: "ไม่พบคอร์ส" } as const;
  const access = await assertCourseAccess(courseId.data, "teach");

  const table = await readTable(formData.get("file"));
  if (typeof table === "string") return { error: table } as const;
  const result = parseQuestionTable(table);
  if (!result.ok) return { error: result.error } as const;
  return { courseId: courseId.data, user: access.user, result } as const;
}

/** ตรวจไฟล์และแสดงผลรายแถวก่อนยืนยัน — ยังไม่เขียน DB */
export async function previewQuestionImport(formData: FormData): Promise<QuestionImportPreview> {
  const parsed = await parseUpload(formData);
  if ("error" in parsed) {
    return { ok: false, message: parsed.error!, rows: [], validCount: 0, errorCount: 0 };
  }
  const { result } = parsed;

  return {
    ok: result.errorCount === 0 && result.validCount > 0,
    message:
      result.errorCount > 0
        ? `พบข้อผิดพลาด ${result.errorCount} แถว — แก้ไขไฟล์แล้วอัปโหลดใหม่`
        : `ตรวจไฟล์เรียบร้อย พร้อมนำเข้า ${result.validCount} ข้อ`,
    rows: result.rows.map((row) => ({
      line: row.line,
      ok: row.ok,
      preview: row.preview,
      type: row.ok ? row.question.type : null,
      error: row.ok ? null : row.error,
    })),
    validCount: result.validCount,
    errorCount: result.errorCount,
  };
}

/**
 * ยืนยันนำเข้า — อ่านและตรวจไฟล์ใหม่ทั้งหมด (ไม่เชื่อผลตรวจที่ client ถือไว้)
 * และนำเข้าแบบ "ทั้งหมดหรือไม่มีเลย" ถ้ามีแถวผิดแม้แถวเดียว
 */
export async function confirmQuestionImport(formData: FormData): Promise<ActionResult> {
  const parsed = await parseUpload(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error! };
  const { courseId, user, result } = parsed;

  if (result.errorCount > 0 || result.validCount === 0) {
    return { ok: false, message: `ไฟล์ยังมีข้อผิดพลาด ${result.errorCount} แถว — ยังไม่ได้นำเข้า` };
  }

  const questions = result.rows.flatMap((row) => (row.ok ? [row.question] : []));
  await db.$transaction(
    questions.map((q: ImportedQuestion) =>
      db.question.create({
        data: {
          courseId,
          type: q.type,
          prompt: q.prompt,
          explanation: q.explanation ?? undefined,
          points: q.points,
          tags: q.tags,
          choices: {
            create: q.choices.map((c, position) => ({
              text: c.text,
              isCorrect: c.isCorrect,
              matchKey: c.matchKey,
              position,
            })),
          },
        },
        select: { id: true },
      }),
    ),
  );

  await writeAudit({
    actorId: user.id,
    action: "question.import",
    entity: "Course",
    entityId: courseId,
    after: { count: questions.length, file: (formData.get("file") as File).name },
  });

  revalidateBank(courseId);
  return { ok: true, message: `นำเข้าข้อสอบ ${questions.length} ข้อแล้ว` };
}

/** ไฟล์แม่แบบสำหรับนำเข้า — ส่งเป็น base64 ให้ client สร้างไฟล์ดาวน์โหลดเอง (ไม่ต้องเพิ่ม route) */
export async function downloadQuestionTemplate(
  format: "csv" | "xlsx",
): Promise<{ filename: string; mime: string; base64: string }> {
  await requireCourseCreator();

  if (format === "xlsx") {
    const buffer = await toXlsx("ข้อสอบ", QUESTION_TEMPLATE_ROWS);
    return {
      filename: "แม่แบบนำเข้าข้อสอบ.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buffer.toString("base64"),
    };
  }
  return {
    filename: "แม่แบบนำเข้าข้อสอบ.csv",
    mime: "text/csv;charset=utf-8",
    base64: Buffer.from(toCsv(QUESTION_TEMPLATE_ROWS), "utf-8").toString("base64"),
  };
}
