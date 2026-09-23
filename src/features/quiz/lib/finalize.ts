import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AttemptStatus } from "@/generated/prisma/enums";
import {
  notifyCourseCompleted,
  progressTargetFor,
  writeProgress,
} from "@/features/enrollment/lib/progress-writer";
import { gradeAnswer, totalAttempt } from "@/features/quiz/lib/grading";
import { isOverdue, parseSlots } from "@/features/quiz/lib/attempt";
import { afterScoreChange } from "@/features/gradebook/lib/sync";

/**
 * M07 · FR-07.4 / FR-07.5 — ปิด attempt: ตรวจทุกข้อ รวมคะแนน และบันทึกผล
 *
 * ถูกเรียกจาก 2 ทาง: ผู้เรียนกดส่ง / หมดเวลาแล้วระบบแตะ attempt (ไม่มี cron — phase-2-plan ขั้น 2)
 * ปลอดภัยต่อการเรียกซ้ำพร้อมกัน: "จอง" attempt ด้วย updateMany ที่มีเงื่อนไข status = IN_PROGRESS
 * คนที่จองไม่ได้จะไม่เขียนอะไรเลย
 *
 * ผู้เรียกต้องตรวจสิทธิ์มาก่อนแล้ว (เจ้าของ attempt หรือผู้สอนของคอร์ส)
 */
export async function finalizeAttempt(
  attemptId: string,
  reason: "submit" | "timeout",
  now: Date = new Date(),
): Promise<{ finalized: boolean; passed: boolean | null }> {
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      questionOrder: true,
      quiz: { select: { id: true, courseId: true, lessonId: true, passingPct: true } },
      answers: { select: { questionId: true, response: true } },
    },
  });
  if (!attempt || attempt.status !== AttemptStatus.IN_PROGRESS) {
    return { finalized: false, passed: null };
  }

  const slots = parseSlots(attempt.questionOrder);
  const questions = await db.question.findMany({
    where: { id: { in: slots.map((s) => s.q) } },
    select: {
      id: true,
      type: true,
      choices: { select: { id: true, text: true, isCorrect: true, matchKey: true } },
    },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map(attempt.answers.map((a) => [a.questionId, a.response]));

  const graded = slots.map((slot) => {
    const question = byId.get(slot.q);
    const response = answers.get(slot.q);
    // ข้อที่ถูกลบออกจากคลังระหว่างสอบ (แทบไม่เกิดเพราะมีแต่ archive) นับเป็น 0 คะแนน
    const result = question
      ? gradeAnswer({ type: question.type, points: slot.p, choices: question.choices }, response)
      : { isCorrect: false, score: 0 };
    return { slot, answered: response !== undefined, result, pendingReview: result.score === null };
  });

  const totals = totalAttempt(
    graded.map((g) => ({ points: g.slot.p, score: g.result.score, pendingReview: g.pendingReview })),
    attempt.quiz.passingPct,
  );

  // หมดเวลา: บันทึกเวลาส่งเป็นเวลาหมดจริง ไม่ใช่เวลาที่ระบบบังเอิญมาเจอ
  const submittedAt =
    reason === "timeout" && attempt.expiresAt && attempt.expiresAt < now ? attempt.expiresAt : now;

  const claimed = await db.$transaction(async (tx) => {
    const claim = await tx.quizAttempt.updateMany({
      where: { id: attempt.id, status: AttemptStatus.IN_PROGRESS },
      data: {
        status: totals.pending ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED,
        submittedAt,
        score: totals.score,
        maxScore: totals.maxScore,
        passed: totals.passed,
      },
    });
    if (claim.count === 0) return false;

    for (const g of graded) {
      if (!g.answered) continue;
      await tx.answer.update({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: g.slot.q } },
        data: { isCorrect: g.result.isCorrect, score: g.result.score },
      });
    }
    return true;
  });
  if (!claimed) return { finalized: false, passed: null };

  await writeAudit({
    actorId: reason === "submit" ? attempt.userId : null,
    action: reason === "submit" ? "quiz.submit" : "quiz.timeout",
    entity: "QuizAttempt",
    entityId: attempt.id,
    after: { score: totals.score, maxScore: totals.maxScore, passed: totals.passed, pending: totals.pending },
  });

  // M09 — ตรวจเสร็จแล้วเท่านั้นที่เข้าสมุดคะแนน (ยังมีอัตนัยรอตรวจ = รอ reviewAnswer)
  if (!totals.pending) await afterScoreChange(attempt.quiz.courseId, attempt.userId);
  if (totals.passed) await recordPass(attempt.userId, attempt.quiz.courseId, attempt.quiz.lessonId);
  return { finalized: true, passed: totals.passed };
}

/**
 * สอบผ่าน → บทแบบทดสอบนับว่าเรียนจบ และคำนวณเงื่อนไขจบคอร์สใหม่ (`requireQuizPass`)
 * แบบทดสอบที่ไม่ได้ผูกกับบทเรียนก็ยังต้องคำนวณใหม่ เพราะอาจเป็นเงื่อนไขสุดท้ายที่ขาด
 */
export async function recordPass(userId: string, courseId: string, lessonId: string | null) {
  const target = await progressTargetFor(userId, courseId);
  if (!target) return;
  const result = await writeProgress(target, lessonId, lessonId ? { completed: true } : {});
  await notifyCourseCompleted(result, userId);
}

/** ปิด attempt ที่เลยเวลาแล้ว (lazy — แทน cron) · คืน true เมื่อมีการปิดจริง */
export async function closeIfOverdue(attempt: {
  id: string;
  status: AttemptStatus;
  expiresAt: Date | null;
}): Promise<boolean> {
  if (attempt.status !== AttemptStatus.IN_PROGRESS || !isOverdue(attempt.expiresAt, new Date())) {
    return false;
  }
  return (await finalizeAttempt(attempt.id, "timeout")).finalized;
}

