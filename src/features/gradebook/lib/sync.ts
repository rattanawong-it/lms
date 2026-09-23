import "server-only";
import { db } from "@/lib/db";
import { toScore } from "@/lib/decimal";
import { AttemptStatus, GradeSource, SubmissionStatus } from "@/generated/prisma/enums";
import { parseCompletionRule } from "@/features/courses/schemas";
import {
  notifyCourseCompleted,
  progressTargetFor,
  writeProgress,
} from "@/features/enrollment/lib/progress-writer";

/**
 * M09 · FR-09.1 — รายการคะแนนอัตโนมัติจากแบบทดสอบ/งาน และการดึงคะแนนเข้าสมุด
 *
 * ไม่มี cron — ซิงก์ทันทีเมื่อคะแนนต้นทางเปลี่ยน (ส่งข้อสอบ, ตรวจอัตนัย, ตรวจงาน, ส่งงาน)
 * และซิงก์ทั้งคอร์สอีกรอบตอนผู้สอนเปิดสมุดคะแนน (ซ่อมข้อมูลที่เกิดก่อนมีสมุดคะแนน)
 *
 * คะแนนที่ผู้สอนแก้ทับ (`Grade.overridden`) ไม่ถูกเขียนทับ (phase-2-plan §4 ข้อ S3)
 */

/** แบบทดสอบลงสมุดเป็นเปอร์เซ็นต์ของครั้งที่ดีที่สุด (Q2) — คะแนนเต็มของแต่ละครั้งต่างกันได้เพราะสุ่มข้อ */
export const QUIZ_ITEM_MAX = 100;

const pctOf = (score: number, max: number) => Math.round((score / max) * 10000) / 100;

/** สร้างรายการของแบบทดสอบ/งานที่ยังไม่มี และอัปเดตชื่อ/คะแนนเต็มให้ตรงต้นทาง · คืนทุกรายการของคอร์ส */
export async function ensureGradeItems(courseId: string) {
  const [quizzes, assignments, items] = await Promise.all([
    db.quiz.findMany({ where: { courseId }, select: { id: true, title: true } }),
    db.assignment.findMany({ where: { courseId }, select: { id: true, title: true, maxScore: true } }),
    db.gradeItem.findMany({
      where: { courseId },
      select: { id: true, title: true, source: true, quizId: true, assignmentId: true, maxScore: true, position: true },
    }),
  ]);

  let position = items.reduce((max, i) => Math.max(max, i.position), -1);
  const byQuiz = new Map(items.filter((i) => i.quizId).map((i) => [i.quizId!, i]));
  const byAssignment = new Map(items.filter((i) => i.assignmentId).map((i) => [i.assignmentId!, i]));
  let changed = false;

  for (const quiz of quizzes) {
    const item = byQuiz.get(quiz.id);
    if (!item) {
      await db.gradeItem.create({
        data: { courseId, title: quiz.title, source: GradeSource.QUIZ, quizId: quiz.id, weight: 0, maxScore: QUIZ_ITEM_MAX, position: (position += 1) },
      });
      changed = true;
    } else if (item.title !== quiz.title) {
      await db.gradeItem.update({ where: { id: item.id }, data: { title: quiz.title } });
      changed = true;
    }
  }
  for (const assignment of assignments) {
    const item = byAssignment.get(assignment.id);
    if (!item) {
      await db.gradeItem.create({
        data: {
          courseId,
          title: assignment.title,
          source: GradeSource.ASSIGNMENT,
          assignmentId: assignment.id,
          weight: 0,
          maxScore: assignment.maxScore,
          position: (position += 1),
        },
      });
      changed = true;
    } else if (item.title !== assignment.title || !item.maxScore.equals(assignment.maxScore)) {
      await db.gradeItem.update({
        where: { id: item.id },
        data: { title: assignment.title, maxScore: assignment.maxScore },
      });
      changed = true;
    }
  }

  if (!changed) return items;
  return db.gradeItem.findMany({
    where: { courseId },
    select: { id: true, title: true, source: true, quizId: true, assignmentId: true, maxScore: true, position: true },
  });
}

/**
 * คำนวณคะแนนของรายการอัตโนมัติจากต้นทางแล้วเขียนลง `Grade` (เฉพาะช่องที่เปลี่ยนและไม่ได้ถูกแก้ทับ)
 * `userIds` ไม่ระบุ = ทั้งคอร์ส
 */
export async function syncCourseGrades(courseId: string, userIds?: string[]): Promise<void> {
  const items = (await ensureGradeItems(courseId)).filter((i) => i.source !== GradeSource.MANUAL);
  if (items.length === 0) return;

  const quizItem = new Map(items.filter((i) => i.quizId).map((i) => [i.quizId!, i.id]));
  const assignmentItem = new Map(items.filter((i) => i.assignmentId).map((i) => [i.assignmentId!, i.id]));
  const users = userIds ? { userId: { in: userIds } } : {};

  const [attempts, submissions, existing] = await Promise.all([
    db.quizAttempt.findMany({
      where: { quizId: { in: [...quizItem.keys()] }, status: AttemptStatus.GRADED, ...users },
      select: { quizId: true, userId: true, score: true, maxScore: true },
    }),
    db.submission.findMany({
      where: { assignmentId: { in: [...assignmentItem.keys()] }, ...users },
      select: { assignmentId: true, userId: true, attemptNo: true, status: true, score: true },
    }),
    db.grade.findMany({
      where: { gradeItemId: { in: items.map((i) => i.id) }, ...users },
      select: { gradeItemId: true, userId: true, score: true, overridden: true },
    }),
  ]);

  const key = (itemId: string, userId: string) => `${itemId}:${userId}`;
  const computed = new Map<string, number | null>();

  // Q2 — แบบทดสอบนับครั้งที่ได้เปอร์เซ็นต์สูงสุด
  for (const a of attempts) {
    const score = toScore(a.score);
    const max = toScore(a.maxScore);
    if (score === null || !max) continue;
    const k = key(quizItem.get(a.quizId)!, a.userId);
    computed.set(k, Math.max(computed.get(k) ?? 0, pctOf(score, max)));
  }

  // งาน: การส่งครั้งล่าสุด ถ้าตรวจแล้ว (ส่งกลับให้แก้/รอตรวจ = ยังไม่มีคะแนน)
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) {
    const k = key(assignmentItem.get(s.assignmentId)!, s.userId);
    const current = latest.get(k);
    if (!current || s.attemptNo > current.attemptNo) latest.set(k, s);
  }
  for (const [k, s] of latest) {
    computed.set(k, s.status === SubmissionStatus.GRADED ? toScore(s.score) : null);
  }

  const stored = new Map(existing.map((g) => [key(g.gradeItemId, g.userId), g]));
  for (const k of new Set([...computed.keys(), ...stored.keys()])) {
    const target = computed.get(k) ?? null;
    const row = stored.get(k);
    if (row?.overridden) continue;
    if (row ? toScore(row.score) === target : target === null) continue;

    const [gradeItemId, userId] = k.split(":") as [string, string];
    await db.grade.upsert({
      where: { gradeItemId_userId: { gradeItemId, userId } },
      create: { gradeItemId, userId, score: target },
      update: { score: target },
    });
  }
}

/**
 * คะแนนเปลี่ยนแล้วคอร์สที่ตั้ง "คะแนนขั้นต่ำ" ต้องตัดสินจบใหม่ (ขึ้นหรือลงก็ได้)
 * คอร์สที่ไม่ได้ตั้งเงื่อนไขนี้ไม่ต้องทำอะไร
 */
export async function recomputeCompletion(courseId: string, userIds: string[]): Promise<void> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { completionRule: true } });
  if (!course || parseCompletionRule(course.completionRule).minScore === null) return;

  for (const userId of userIds) {
    const target = await progressTargetFor(userId, courseId);
    if (!target) continue;
    await notifyCourseCompleted(await writeProgress(target, null), userId);
  }
}

/** จุดเดียวที่ฟีเจอร์ต้นทางเรียกหลังคะแนนของผู้เรียนเปลี่ยน */
export async function afterScoreChange(courseId: string, userId: string): Promise<void> {
  await syncCourseGrades(courseId, [userId]);
  await recomputeCompletion(courseId, [userId]);
}
