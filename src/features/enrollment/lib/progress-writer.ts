import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { EnrollmentStatus, NotificationType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { parseCompletionRule } from "@/features/courses/schemas";
import {
  calcProgressPct,
  meetsCompletionRule,
  type QuizOutcome,
} from "@/features/enrollment/lib/progress";

/**
 * FR-06.3 — จุดเดียวที่เขียนความคืบหน้าและตัดสินการจบคอร์ส
 *
 * แยกออกจาก `actions.ts` เพราะมีผู้เรียกมากกว่าหนึ่งฟีเจอร์: ปุ่มเรียนจบ/วิดีโอ (M06)
 * และการสอบผ่าน (M07) ซึ่งอาจเกิดตอน "ผู้สอน" เปิดผลสอบแล้วระบบปิด attempt ที่หมดเวลาให้
 * ตัวเขียนจึงรับเป้าหมาย (enrollment ของผู้เรียนคนไหน) ตรง ๆ ไม่ผูกกับ session ปัจจุบัน
 * ผู้เรียกต้องตรวจสิทธิ์มาก่อนแล้วเสมอ
 */
export type ProgressTarget = {
  enrollmentId: string;
  userId: string;
  courseId: string;
  completionRule: unknown;
  totalLessons: number;
};

export type ProgressResult = { progressPct: number; courseCompleted: boolean; justCompleted: boolean };

/**
 * FR-04.7 · M07 — ผลแบบทดสอบของผู้เรียนในคอร์ส (ไม่มีแบบทดสอบ = undefined เงื่อนไขที่อิงแบบทดสอบถูกข้าม)
 * `totalScorePct` จะมาจากคะแนนรวมถ่วงน้ำหนักของสมุดคะแนนในขั้น 5 (Q4) — ตอนนี้ยังเป็น null
 */
async function quizOutcome(
  tx: Prisma.TransactionClient,
  userId: string,
  courseId: string,
): Promise<QuizOutcome | undefined> {
  const quizzes = await tx.quiz.findMany({ where: { courseId }, select: { id: true } });
  if (quizzes.length === 0) return undefined;

  const passed = await tx.quizAttempt.findMany({
    where: { userId, passed: true, quizId: { in: quizzes.map((q) => q.id) } },
    select: { quizId: true },
    distinct: ["quizId"],
  });
  return { allPassed: passed.length === quizzes.length, totalScorePct: null };
}

/**
 * เขียน LessonProgress แล้วคำนวณ progressPct + สถานะใหม่ใน transaction เดียวกัน
 * (system-design §3.3) · `lessonId = null` = คำนวณสถานะใหม่อย่างเดียว เช่นหลังสอบผ่าน
 * แบบทดสอบที่ไม่ได้ผูกกับบทเรียน
 */
export async function writeProgress(
  target: ProgressTarget,
  lessonId: string | null,
  data: { completed?: boolean; lastPositionSec?: number } = {},
): Promise<ProgressResult> {
  const rule = parseCompletionRule(target.completionRule);

  return db.$transaction(async (tx) => {
    if (lessonId) {
      await tx.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: target.enrollmentId, lessonId } },
        create: {
          enrollmentId: target.enrollmentId,
          lessonId,
          completed: data.completed ?? false,
          lastPositionSec: data.lastPositionSec ?? 0,
          completedAt: data.completed ? new Date() : null,
        },
        update: {
          ...(data.completed === undefined
            ? {}
            : { completed: data.completed, completedAt: data.completed ? new Date() : null }),
          ...(data.lastPositionSec === undefined ? {} : { lastPositionSec: data.lastPositionSec }),
        },
      });
    }

    const completedCount = await tx.lessonProgress.count({
      where: { enrollmentId: target.enrollmentId, completed: true },
    });

    const progressPct = calcProgressPct(completedCount, target.totalLessons);
    // minScore อิงคะแนนรวมของสมุดคะแนน (Q4) ซึ่งยังไม่มีจนถึงขั้น 5 — ยังไม่บังคับใช้
    const courseCompleted = meetsCompletionRule(
      progressPct,
      { ...rule, minScore: null },
      await quizOutcome(tx, target.userId, target.courseId),
    );

    const current = await tx.enrollment.findUniqueOrThrow({
      where: { id: target.enrollmentId },
      select: { status: true, completedAt: true },
    });

    // ถอยกลับเป็น ACTIVE ถ้าหลุดเงื่อนไข — ไม่ให้ค้างสถานะ COMPLETED
    const status = courseCompleted
      ? EnrollmentStatus.COMPLETED
      : current.status === EnrollmentStatus.COMPLETED
        ? EnrollmentStatus.ACTIVE
        : current.status;

    await tx.enrollment.update({
      where: { id: target.enrollmentId },
      data: {
        progressPct,
        ...(lessonId ? { lastLessonId: lessonId } : {}),
        status,
        // คงวันที่เรียนจบครั้งแรกไว้ — การทบทวนบทเรียนภายหลังไม่ควรเลื่อนวันจบ
        completedAt: courseCompleted ? (current.completedAt ?? new Date()) : null,
      },
    });

    return {
      progressPct,
      courseCompleted,
      justCompleted: courseCompleted && current.status !== EnrollmentStatus.COMPLETED,
    };
  });
}

/** หาเป้าหมายของผู้เรียนคนหนึ่งในคอร์ส — ไม่มี enrollment ที่ใช้งานอยู่คืน null */
export async function progressTargetFor(userId: string, courseId: string): Promise<ProgressTarget | null> {
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: {
      id: true,
      status: true,
      course: {
        select: {
          completionRule: true,
          sections: { select: { _count: { select: { lessons: true } } } },
        },
      },
    },
  });
  if (
    !enrollment ||
    (enrollment.status !== EnrollmentStatus.ACTIVE && enrollment.status !== EnrollmentStatus.COMPLETED)
  ) {
    return null;
  }
  return {
    enrollmentId: enrollment.id,
    userId,
    courseId,
    completionRule: enrollment.course.completionRule,
    totalLessons: enrollment.course.sections.reduce((sum, s) => sum + s._count.lessons, 0),
  };
}

/** แจ้งผู้เรียนเมื่อเพิ่งจบคอร์ส — ใช้ร่วมระหว่างปุ่มเรียนจบและการสอบผ่าน */
export async function notifyCourseCompleted(result: ProgressResult, userId: string): Promise<void> {
  if (!result.justCompleted) return;
  await notify({
    userIds: [userId],
    type: NotificationType.ENROLLED,
    title: "ยินดีด้วย คุณเรียนจบคอร์สแล้ว",
    link: "/my-courses",
  });
}
