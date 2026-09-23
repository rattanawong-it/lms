"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { toScore } from "@/lib/decimal";
import { toCsv } from "@/lib/csv";
import { toXlsx } from "@/lib/xlsx";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { EnrollmentStatus, GradeSource } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { recomputeCompletion, syncCourseGrades } from "@/features/gradebook/lib/sync";
import {
  cellScoreSchema,
  gradeScaleSchema,
  manualItemSchema,
  MAX_MANUAL_ITEMS,
  weightsSchema,
} from "@/features/gradebook/schemas";
import { getGradebook } from "@/features/gradebook/queries";

/**
 * M09 · FR-09.1–09.3 / FR-09.5 — แก้คะแนนในตาราง รายการกรอกเอง น้ำหนัก เกณฑ์ตัดเกรด และส่งออก
 * ทุกการเขียนตรวจสิทธิ์ตามคอร์สที่รายการคะแนนสังกัดจริง และบันทึก AuditLog ค่าเดิม/ค่าใหม่
 */

const idSchema = z.cuid();

function revalidateGradebook(courseId: string) {
  revalidatePath(`/teach/courses/${courseId}/gradebook`, "layout");
  revalidatePath(`/learn/${courseId}/grades`);
}

function readJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** ผู้เรียนที่คะแนนเปลี่ยน — คอร์สที่ตั้งคะแนนขั้นต่ำต้องตัดสินจบใหม่ */
async function enrolledUserIds(courseId: string): Promise<string[]> {
  const rows = await db.enrollment.findMany({
    where: { courseId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** โหลดรายการคะแนนแล้วตรวจสิทธิ์ตามคอร์สของรายการนั้น (ไม่เชื่อ courseId จากฟอร์ม) */
async function loadItem(itemId: unknown) {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return null;
  const item = await db.gradeItem.findUnique({
    where: { id: id.data },
    select: { id: true, courseId: true, title: true, source: true, maxScore: true },
  });
  if (!item) return null;
  const { user } = await assertCourseAccess(item.courseId, "teach");
  return { item, user };
}

/* ─────────────────────────── ช่องคะแนน (FR-09.3) ─────────────────────────── */

/**
 * แก้คะแนนหนึ่งช่อง — ช่องของแบบทดสอบ/งานถูกทำเครื่องหมาย "แก้ทับ" (ผลใหม่จากต้นทางจะไม่เขียนทับ)
 * ช่องว่าง = ลบคะแนน
 */
export async function setGrade(formData: FormData): Promise<ActionResult> {
  const loaded = await loadItem(formData.get("itemId"));
  if (!loaded) return { ok: false, message: "ไม่พบรายการคะแนน" };
  const { item, user } = loaded;

  const userId = idSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, message: "ไม่พบผู้เรียน" };
  const enrolled = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: userId.data, courseId: item.courseId } },
    select: { id: true },
  });
  if (!enrolled) return { ok: false, message: "ผู้เรียนคนนี้ไม่ได้อยู่ในคอร์ส" };

  const parsed = cellScoreSchema.safeParse(formData.get("score"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const score = parsed.data;
  const maxScore = toScore(item.maxScore);
  if (score !== null && score > maxScore) return { ok: false, message: `รายการนี้เต็ม ${maxScore} คะแนน` };

  const before = await db.grade.findUnique({
    where: { gradeItemId_userId: { gradeItemId: item.id, userId: userId.data } },
    select: { score: true, overridden: true },
  });
  const overridden = item.source !== GradeSource.MANUAL;
  await db.grade.upsert({
    where: { gradeItemId_userId: { gradeItemId: item.id, userId: userId.data } },
    create: { gradeItemId: item.id, userId: userId.data, score, overridden },
    update: { score, overridden },
  });

  await writeAudit({
    actorId: user.id,
    action: "gradebook.grade",
    entity: "Grade",
    entityId: `${item.id}:${userId.data}`,
    before: { item: item.title, score: toScore(before?.score ?? null), overridden: before?.overridden ?? false },
    after: { item: item.title, score, overridden },
  });

  await recomputeCompletion(item.courseId, [userId.data]);
  revalidateGradebook(item.courseId);
  return { ok: true, message: "บันทึกคะแนนแล้ว" };
}

/** เลิกแก้ทับ — ช่องกลับไปใช้คะแนนจากแบบทดสอบ/งานตามเดิม */
export async function resetGrade(formData: FormData): Promise<ActionResult> {
  const loaded = await loadItem(formData.get("itemId"));
  if (!loaded) return { ok: false, message: "ไม่พบรายการคะแนน" };
  const { item, user } = loaded;
  const userId = idSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, message: "ไม่พบผู้เรียน" };
  if (item.source === GradeSource.MANUAL) return { ok: false, message: "รายการกรอกเองไม่มีคะแนนอัตโนมัติ" };

  const before = await db.grade.findUnique({
    where: { gradeItemId_userId: { gradeItemId: item.id, userId: userId.data } },
    select: { score: true, overridden: true },
  });
  if (!before?.overridden) return { ok: true, message: "ช่องนี้ใช้คะแนนอัตโนมัติอยู่แล้ว" };

  await db.grade.update({
    where: { gradeItemId_userId: { gradeItemId: item.id, userId: userId.data } },
    data: { overridden: false },
  });
  await syncCourseGrades(item.courseId, [userId.data]);
  const after = await db.grade.findUnique({
    where: { gradeItemId_userId: { gradeItemId: item.id, userId: userId.data } },
    select: { score: true },
  });

  await writeAudit({
    actorId: user.id,
    action: "gradebook.reset",
    entity: "Grade",
    entityId: `${item.id}:${userId.data}`,
    before: { item: item.title, score: toScore(before.score), overridden: true },
    after: { item: item.title, score: toScore(after?.score ?? null), overridden: false },
  });

  await recomputeCompletion(item.courseId, [userId.data]);
  revalidateGradebook(item.courseId);
  return { ok: true, message: "กลับไปใช้คะแนนอัตโนมัติแล้ว" };
}

/* ─────────────────────────── รายการและน้ำหนัก (FR-09.1 / FR-09.2) ─────────────────────────── */

export async function addManualItem(formData: FormData): Promise<ActionResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const parsed = manualItemSchema.safeParse({ title: formData.get("title"), maxScore: formData.get("maxScore") });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const [manualCount, last] = await Promise.all([
    db.gradeItem.count({ where: { courseId: courseId.data, source: GradeSource.MANUAL } }),
    db.gradeItem.findFirst({ where: { courseId: courseId.data }, orderBy: { position: "desc" }, select: { position: true } }),
  ]);
  if (manualCount >= MAX_MANUAL_ITEMS) return { ok: false, message: `รายการกรอกเองมีได้ไม่เกิน ${MAX_MANUAL_ITEMS} รายการ` };

  const item = await db.gradeItem.create({
    data: {
      courseId: courseId.data,
      title: parsed.data.title,
      source: GradeSource.MANUAL,
      maxScore: parsed.data.maxScore,
      weight: 0,
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  });
  await writeAudit({
    actorId: user.id,
    action: "gradebook.item.create",
    entity: "GradeItem",
    entityId: item.id,
    after: parsed.data,
  });

  revalidateGradebook(courseId.data);
  return { ok: true, message: "เพิ่มรายการคะแนนแล้ว — อย่าลืมกำหนดน้ำหนัก" };
}

/** ลบได้เฉพาะรายการกรอกเอง (รายการอัตโนมัติหายไปเองเมื่อลบแบบทดสอบ/งานต้นทาง) — คะแนนในรายการถูกลบด้วย */
export async function deleteManualItem(formData: FormData): Promise<ActionResult> {
  const loaded = await loadItem(formData.get("itemId"));
  if (!loaded) return { ok: false, message: "ไม่พบรายการคะแนน" };
  const { item, user } = loaded;
  if (item.source !== GradeSource.MANUAL) return { ok: false, message: "รายการจากแบบทดสอบ/งานลบจากที่นี่ไม่ได้" };

  const graded = await db.grade.count({ where: { gradeItemId: item.id, score: { not: null } } });
  await db.gradeItem.delete({ where: { id: item.id } });
  await writeAudit({
    actorId: user.id,
    action: "gradebook.item.delete",
    entity: "GradeItem",
    entityId: item.id,
    before: { title: item.title, maxScore: toScore(item.maxScore), gradedCount: graded },
  });

  await recomputeCompletion(item.courseId, await enrolledUserIds(item.courseId));
  revalidateGradebook(item.courseId);
  return { ok: true, message: "ลบรายการคะแนนแล้ว" };
}

/** บันทึกน้ำหนักทุกรายการพร้อมกัน — รวมไม่ถึง 100% ก็บันทึกได้ แต่ระบบยังคำนวณเกรดไม่ได้ */
export async function saveWeights(formData: FormData): Promise<ActionResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const parsed = weightsSchema.safeParse(readJson(formData.get("weights")));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "น้ำหนักไม่ถูกต้อง" };

  const items = await db.gradeItem.findMany({
    where: { courseId: courseId.data },
    select: { id: true, title: true, weight: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  if (parsed.data.some((w) => !byId.has(w.id))) return { ok: false, message: "มีรายการที่ไม่อยู่ในคอร์สนี้ กรุณารีเฟรชหน้า" };

  const changes = parsed.data.filter((w) => toScore(byId.get(w.id)!.weight) !== w.weight);
  if (changes.length === 0) return { ok: true, message: "น้ำหนักไม่มีการเปลี่ยนแปลง" };

  await db.$transaction(changes.map((w) => db.gradeItem.update({ where: { id: w.id }, data: { weight: w.weight } })));
  await writeAudit({
    actorId: user.id,
    action: "gradebook.weights",
    entity: "Course",
    entityId: courseId.data,
    before: changes.map((w) => ({ item: byId.get(w.id)!.title, weight: toScore(byId.get(w.id)!.weight) })),
    after: changes.map((w) => ({ item: byId.get(w.id)!.title, weight: w.weight })),
  });

  await recomputeCompletion(courseId.data, await enrolledUserIds(courseId.data));
  revalidateGradebook(courseId.data);
  const total = items.reduce((sum, i) => sum + (parsed.data.find((w) => w.id === i.id)?.weight ?? toScore(i.weight)), 0);
  return {
    ok: true,
    message:
      Math.round(total * 100) === 10000
        ? "บันทึกน้ำหนักแล้ว"
        : `บันทึกน้ำหนักแล้ว — รวม ${Math.round(total * 100) / 100}% ยังไม่ครบ 100% จึงยังคำนวณเกรดไม่ได้`,
  };
}

/** FR-09.2 — เกณฑ์ตัดเกรดของคอร์ส · `reset` = กลับไปใช้ค่าตั้งต้นของระบบ */
export async function saveGradeScale(formData: FormData): Promise<ActionResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const reset = formData.get("reset") === "true";
  const parsed = reset ? null : gradeScaleSchema.safeParse(readJson(formData.get("bands")));
  if (parsed && !parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "เกณฑ์ไม่ถูกต้อง" };

  const before = await db.course.findUniqueOrThrow({ where: { id: courseId.data }, select: { gradeScale: true } });
  const bands = parsed?.data.map((b) => ({ grade: b.grade, min: b.min })) ?? null;
  await db.course.update({
    where: { id: courseId.data },
    data: { gradeScale: bands ?? Prisma.DbNull },
  });
  await writeAudit({
    actorId: user.id,
    action: "gradebook.scale",
    entity: "Course",
    entityId: courseId.data,
    before: { gradeScale: before.gradeScale ?? null },
    after: { gradeScale: bands },
  });

  revalidateGradebook(courseId.data);
  return { ok: true, message: reset ? "กลับไปใช้เกณฑ์ตั้งต้นแล้ว" : "บันทึกเกณฑ์ตัดเกรดแล้ว" };
}

/* ─────────────────────────── ส่งออก (FR-09.5) ─────────────────────────── */

/** ส่งเป็น base64 ให้ client สร้างไฟล์ดาวน์โหลดเอง (แบบเดียวกับแม่แบบนำเข้าข้อสอบ — ไม่ต้องเพิ่ม route) */
export async function exportGradebook(
  courseId: string,
  format: "csv" | "xlsx",
): Promise<{ filename: string; mime: string; base64: string }> {
  const { course, items, rows } = await getGradebook(courseId);
  const header = [
    "รหัส",
    "ชื่อ",
    "อีเมล",
    ...items.map((i) => `${i.title} (เต็ม ${i.maxScore} · ${i.weight}%)`),
    "คะแนนรวม (100)",
    "เกรด",
  ];
  const table = [
    header,
    ...rows.map((r) => [
      r.student.externalId ?? "",
      r.student.name,
      r.student.email,
      ...items.map((i) => r.cells[i.id]!.score),
      r.total,
      r.grade ?? "",
    ]),
  ];

  const user = await assertCourseAccess(courseId, "teach");
  await writeAudit({
    actorId: user.user.id,
    action: "gradebook.export",
    entity: "Course",
    entityId: courseId,
    after: { format, rows: rows.length },
  });

  const name = `สมุดคะแนน ${course.title}`.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  if (format === "xlsx") {
    return {
      filename: `${name}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: (await toXlsx("สมุดคะแนน", table)).toString("base64"),
    };
  }
  return {
    filename: `${name}.csv`,
    mime: "text/csv;charset=utf-8",
    base64: Buffer.from(toCsv(table), "utf-8").toString("base64"),
  };
}
