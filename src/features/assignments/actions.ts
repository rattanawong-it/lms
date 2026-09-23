"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { formatScore, toScore } from "@/lib/decimal";
import { notify } from "@/lib/notify";
import { parseRichTextField } from "@/lib/rich-text-doc";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { AssetKind, AssetStatus, LessonType, NotificationType, SubmissionStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getLessonAccess } from "@/features/enrollment/queries";
import {
  notifyCourseCompleted,
  progressTargetFor,
  writeProgress,
} from "@/features/enrollment/lib/progress-writer";
import {
  assignmentSettingsSchema,
  gradeSubmissionSchema,
  submitAssignmentSchema,
} from "@/features/assignments/schemas";
import { gradeScoreError, submissionFileError, submitState } from "@/features/assignments/lib/rules";
import { afterScoreChange } from "@/features/gradebook/lib/sync";

/**
 * M08 · FR-08.1–08.4 — ตั้งค่างาน การส่งงานของผู้เรียน และการตรวจของผู้สอน
 */

const idSchema = z.cuid();

function revalidateAssignments(courseId: string) {
  revalidatePath(`/teach/courses/${courseId}/assignments`, "layout");
  revalidatePath(`/teach/courses/${courseId}/gradebook`, "layout");
  revalidatePath("/learn", "layout");
  revalidatePath("/dashboard");
}

/* ─────────────────────────── ผู้สอน (FR-08.1) ─────────────────────────── */

export type SaveAssignmentResult = ActionResult & { assignmentId?: string };

export async function saveAssignment(formData: FormData): Promise<SaveAssignmentResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const idRaw = formData.get("assignmentId");
  const assignmentId = typeof idRaw === "string" && idRaw ? idRaw : null;

  const parsed = assignmentSettingsSchema.safeParse({
    title: formData.get("title"),
    lessonId: formData.get("lessonId"),
    dueAt: formData.get("dueAt"),
    allowLate: formData.get("allowLate"),
    maxScore: formData.get("maxScore"),
    allowedTypes: formData.getAll("allowedTypes"),
    maxFileMb: formData.get("maxFileMb"),
  });
  const instructions = parseRichTextField(formData.get("instructions"));
  if (!parsed.success || !instructions) {
    return {
      ok: false,
      message: "กรุณาตรวจสอบข้อมูลอีกครั้ง",
      fieldErrors: {
        ...(parsed.success ? {} : zodToFieldErrors(parsed.error)),
        ...(instructions ? {} : { instructions: "กรุณาเขียนคำสั่งงาน" }),
      },
    };
  }
  const data = parsed.data;

  // งานที่แก้ต้องอยู่ในคอร์สนี้จริง (ไม่เชื่อคู่ courseId/assignmentId จากฟอร์ม)
  if (assignmentId) {
    const existing = await db.assignment.findFirst({
      where: { id: assignmentId, courseId: courseId.data },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "ไม่พบงาน" };
  }

  // บทเรียนที่ผูกต้องเป็นบทชนิดงานของคอร์สนี้ และยังไม่ผูกกับงานอื่น
  if (data.lessonId) {
    const lesson = await db.lesson.findFirst({
      where: { id: data.lessonId, type: LessonType.ASSIGNMENT, section: { courseId: courseId.data } },
      select: { assignment: { select: { id: true } } },
    });
    if (!lesson) {
      return { ok: false, message: "ไม่พบบทเรียน", fieldErrors: { lessonId: "เลือกบทชนิดงานที่ต้องส่งของคอร์สนี้" } };
    }
    if (lesson.assignment && lesson.assignment.id !== assignmentId) {
      return { ok: false, message: "บทนี้ผูกกับงานอื่นแล้ว", fieldErrors: { lessonId: "บทนี้ผูกกับงานอื่นแล้ว" } };
    }
  }

  const fields = {
    title: data.title,
    lessonId: data.lessonId,
    instructions,
    dueAt: data.dueAt,
    allowLate: data.allowLate,
    maxScore: data.maxScore,
    allowedTypes: data.allowedTypes,
    maxFileMb: data.maxFileMb,
  };

  const saved = assignmentId
    ? await db.assignment.update({ where: { id: assignmentId }, data: fields, select: { id: true } })
    : await db.assignment.create({ data: { courseId: courseId.data, ...fields }, select: { id: true } });

  await writeAudit({
    actorId: user.id,
    action: assignmentId ? "assignment.update" : "assignment.create",
    entity: "Assignment",
    entityId: saved.id,
    after: {
      title: data.title,
      lessonId: data.lessonId,
      dueAt: data.dueAt?.toISOString() ?? null,
      allowLate: data.allowLate,
      maxScore: data.maxScore,
      allowedTypes: data.allowedTypes,
      maxFileMb: data.maxFileMb,
    },
  });

  revalidateAssignments(courseId.data);
  return { ok: true, message: assignmentId ? "บันทึกงานแล้ว" : "สร้างงานแล้ว", assignmentId: saved.id };
}

/** ลบได้เฉพาะงานที่ยังไม่มีใครส่ง — มีงานส่งแล้วต้องเก็บไว้เป็นหลักฐาน */
export async function deleteAssignment(formData: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("assignmentId"));
  if (!id.success) return { ok: false, message: "ไม่พบงาน" };

  const assignment = await db.assignment.findUnique({
    where: { id: id.data },
    select: { id: true, courseId: true, title: true, _count: { select: { submissions: true } } },
  });
  if (!assignment) return { ok: false, message: "ไม่พบงาน" };
  const { user } = await assertCourseAccess(assignment.courseId, "teach");

  if (assignment._count.submissions > 0) {
    return { ok: false, message: `มีผู้ส่งงานแล้ว ${assignment._count.submissions} ครั้ง จึงลบไม่ได้` };
  }

  await db.assignment.delete({ where: { id: assignment.id } });
  await writeAudit({
    actorId: user.id,
    action: "assignment.delete",
    entity: "Assignment",
    entityId: assignment.id,
    before: { title: assignment.title },
  });

  revalidateAssignments(assignment.courseId);
  return { ok: true, message: "ลบงานแล้ว" };
}

/* ─────────────────────────── ผู้เรียน (FR-08.2 / FR-08.3) ─────────────────────────── */

/**
 * ส่งงาน — ข้อความและ/หรือไฟล์ · ส่งใหม่ได้ตามกติกาใน `lib/rules.ts` โดยเพิ่ม attemptNo ไม่ทับของเดิม
 * ตรวจสิทธิ์ผ่าน `getLessonAccess()` ของบทที่งานผูกอยู่จริง · `isLate` คำนวณที่ server ตอนส่ง
 */
export async function submitAssignment(formData: FormData): Promise<ActionResult> {
  const assignmentId = idSchema.safeParse(formData.get("assignmentId"));
  if (!assignmentId.success) return { ok: false, message: "ไม่พบงาน" };

  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId.data },
    select: {
      id: true,
      title: true,
      courseId: true,
      lessonId: true,
      dueAt: true,
      allowLate: true,
      allowedTypes: true,
      maxFileMb: true,
    },
  });
  if (!assignment?.lessonId) return { ok: false, message: "ไม่พบงาน" };

  const access = await getLessonAccess(assignment.lessonId);
  if (!access) return { ok: false, message: "ไม่พบบทเรียน" };
  if (!access.enrollmentId) return { ok: false, message: "ผู้สอนและผู้ดูแลดูได้แต่ส่งงานไม่ได้" };
  if (!access.unlocked) return { ok: false, message: "ต้องเรียนบทก่อนหน้าให้จบก่อน" };

  const parsed = submitAssignmentSchema.safeParse({
    text: formData.get("text"),
    assetIds: formData.getAll("assetIds"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { text, assetIds } = parsed.data;

  // ไฟล์ต้องเป็นของผู้ส่งเอง อัปโหลดเสร็จแล้ว และตรงกติกาของงาน (presign เชื่อขนาดที่ client แจ้ง จึงตรวจซ้ำตรงนี้)
  const assets = assetIds.length
    ? await db.asset.findMany({
        where: {
          id: { in: assetIds },
          uploadedById: access.userId,
          kind: AssetKind.FILE,
          status: AssetStatus.READY,
        },
        select: { id: true, originalName: true, size: true },
      })
    : [];
  if (assets.length !== assetIds.length) {
    return { ok: false, message: "มีไฟล์ที่ยังอัปโหลดไม่เสร็จหรือใช้ไม่ได้ กรุณาแนบใหม่", fieldErrors: { files: "แนบไฟล์ใหม่อีกครั้ง" } };
  }
  for (const asset of assets) {
    const error = submissionFileError({ name: asset.originalName, size: Number(asset.size) }, assignment);
    if (error) return { ok: false, message: `${asset.originalName}: ${error}`, fieldErrors: { files: error } };
  }

  const now = new Date();
  let created: { id: string; attemptNo: number; isLate: boolean };
  try {
    created = await db.$transaction(async (tx) => {
      const latest = await tx.submission.findFirst({
        where: { assignmentId: assignment.id, userId: access.userId },
        orderBy: { attemptNo: "desc" },
        select: { attemptNo: true, status: true, isLate: true },
      });
      const state = submitState(assignment, latest, now);
      if (!state.canSubmit) throw new SubmitBlocked(state.reason);

      return tx.submission.create({
        data: {
          assignmentId: assignment.id,
          userId: access.userId,
          attemptNo: (latest?.attemptNo ?? 0) + 1,
          text,
          isLate: state.late,
          submittedAt: now,
          files: { create: assets.map((a) => ({ assetId: a.id })) },
        },
        select: { id: true, attemptNo: true, isLate: true },
      });
    });
  } catch (error) {
    if (error instanceof SubmitBlocked) return { ok: false, message: error.message };
    // กดส่งพร้อมกันสองแท็บ — unique [assignmentId, userId, attemptNo] กันไว้
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "มีการส่งงานนี้ซ้อนกัน กรุณารีเฟรชหน้าแล้วตรวจอีกครั้ง" };
    }
    throw error;
  }

  await writeAudit({
    actorId: access.userId,
    action: "assignment.submit",
    entity: "Submission",
    entityId: created.id,
    after: { assignmentId: assignment.id, attemptNo: created.attemptNo, isLate: created.isLate, files: assets.length },
  });

  // ส่งใหม่หลังถูกส่งกลับ = คะแนนเดิมในสมุดหายไปจนกว่าจะตรวจใหม่ (M09)
  await afterScoreChange(assignment.courseId, access.userId);
  // บทงานนับว่าเรียนจบเมื่อส่งแล้ว ไม่ต้องรอตรวจ (phase-2-plan ขั้น 4)
  const target = await progressTargetFor(access.userId, assignment.courseId);
  if (target) await notifyCourseCompleted(await writeProgress(target, assignment.lessonId, { completed: true }), access.userId);

  revalidatePath(`/learn/${assignment.courseId}/${assignment.lessonId}`);
  revalidateAssignments(assignment.courseId);
  revalidatePath("/my-courses");

  return {
    ok: true,
    message: created.isLate
      ? "ส่งงานแล้ว (ส่งช้ากว่ากำหนด)"
      : created.attemptNo > 1
        ? `ส่งงานครั้งที่ ${created.attemptNo} แล้ว`
        : "ส่งงานแล้ว",
  };
}

class SubmitBlocked extends Error {}

/* ─────────────────────────── ผู้สอนตรวจ (FR-08.4) ─────────────────────────── */

/**
 * ให้คะแนน + ความเห็น หรือส่งกลับให้แก้ (เปิดให้ส่งใหม่แม้เลยกำหนด)
 * ตรวจได้เฉพาะการส่งครั้งล่าสุดของผู้เรียนคนนั้น · แก้คะแนนหลังตรวจแล้วได้
 */
export async function gradeSubmission(formData: FormData): Promise<ActionResult> {
  const submissionId = idSchema.safeParse(formData.get("submissionId"));
  if (!submissionId.success) return { ok: false, message: "ไม่พบงานที่ส่ง" };

  const submission = await db.submission.findUnique({
    where: { id: submissionId.data },
    select: {
      id: true,
      userId: true,
      attemptNo: true,
      status: true,
      score: true,
      feedback: true,
      assignment: { select: { id: true, title: true, courseId: true, lessonId: true, maxScore: true } },
    },
  });
  if (!submission) return { ok: false, message: "ไม่พบงานที่ส่ง" };
  const { user } = await assertCourseAccess(submission.assignment.courseId, "teach");

  const newer = await db.submission.count({
    where: { assignmentId: submission.assignment.id, userId: submission.userId, attemptNo: { gt: submission.attemptNo } },
  });
  if (newer > 0) return { ok: false, message: "ผู้เรียนส่งงานครั้งใหม่แล้ว — ตรวจครั้งล่าสุดแทน" };

  const parsed = gradeSubmissionSchema.safeParse({
    decision: formData.get("decision"),
    score: formData.get("score"),
    feedback: formData.get("feedback"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { decision, score, feedback } = parsed.data;
  const maxScore = toScore(submission.assignment.maxScore);
  if (decision === "grade") {
    const error = gradeScoreError(score!, maxScore);
    if (error) return { ok: false, message: error, fieldErrors: { score: error } };
  }

  const now = new Date();
  // เงื่อนไข status/attemptNo เดิม — ผู้เรียนส่งใหม่หรือผู้สอนอีกคนตรวจไปพร้อมกันจะไม่ถูกเขียนทับเงียบ ๆ
  const updated = await db.submission.updateMany({
    where: { id: submission.id, status: submission.status },
    data:
      decision === "grade"
        ? { status: SubmissionStatus.GRADED, score, feedback, gradedById: user.id, gradedAt: now }
        : { status: SubmissionStatus.RETURNED, score: null, feedback, gradedById: user.id, returnedAt: now },
  });
  if (updated.count === 0) return { ok: false, message: "งานนี้เพิ่งถูกแก้ไข กรุณารีเฟรชหน้าแล้วตรวจอีกครั้ง" };

  await writeAudit({
    actorId: user.id,
    action: decision === "grade" ? "assignment.grade" : "assignment.return",
    entity: "Submission",
    entityId: submission.id,
    before: { status: submission.status, score: toScore(submission.score), feedback: submission.feedback },
    after: { status: decision === "grade" ? SubmissionStatus.GRADED : SubmissionStatus.RETURNED, score, feedback },
  });

  const { assignment } = submission;
  await afterScoreChange(assignment.courseId, submission.userId);
  await notify({
    userIds: [submission.userId],
    type: NotificationType.GRADED,
    title:
      decision === "grade"
        ? `ผู้สอนตรวจงาน “${assignment.title}” แล้ว`
        : `ผู้สอนส่งงาน “${assignment.title}” กลับให้แก้`,
    body: decision === "grade" ? `ได้ ${formatScore(score)}/${formatScore(maxScore)} คะแนน` : feedback,
    link: assignment.lessonId ? `/learn/${assignment.courseId}/${assignment.lessonId}` : null,
  });

  revalidateAssignments(assignment.courseId);
  return {
    ok: true,
    message: decision === "grade" ? "บันทึกคะแนนและแจ้งผู้เรียนแล้ว" : "ส่งกลับให้แก้และแจ้งผู้เรียนแล้ว",
  };
}
