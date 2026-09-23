"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { formatScore, toScore } from "@/lib/decimal";
import { notify } from "@/lib/notify";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { AttemptStatus, LessonType, NotificationType, QuestionType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getLessonAccess } from "@/features/enrollment/queries";
import { quizSettingsSchema, responseSchemaFor, reviewAnswerSchema } from "@/features/quiz/schemas";
import {
  acceptsAnswers,
  attemptDeadline,
  drawAttempt,
  parsePool,
  parseSlots,
  quizOpenState,
} from "@/features/quiz/lib/attempt";
import { closeIfOverdue, finalizeAttempt, recordPass } from "@/features/quiz/lib/finalize";
import { essayScoreError, recomputeAttempt } from "@/features/quiz/lib/grading";

/**
 * M07 · FR-07.3 / FR-07.4 / FR-07.5 — ตั้งค่าแบบทดสอบ การทำข้อสอบของผู้เรียน และการตรวจของผู้สอน
 */

const idSchema = z.cuid();

function readJsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function revalidateQuizzes(courseId: string) {
  revalidatePath(`/teach/courses/${courseId}/quizzes`);
  revalidatePath("/learn", "layout");
}

/* ─────────────────────────── ผู้สอน (FR-07.3) ─────────────────────────── */

export type SaveQuizResult = ActionResult & { quizId?: string };

export async function saveQuiz(formData: FormData): Promise<SaveQuizResult> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, message: "ไม่พบคอร์ส" };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const quizIdRaw = formData.get("quizId");
  const quizId = typeof quizIdRaw === "string" && quizIdRaw ? quizIdRaw : null;

  const parsed = quizSettingsSchema.safeParse({
    title: formData.get("title"),
    lessonId: formData.get("lessonId"),
    timeLimitMin: formData.get("timeLimitMin"),
    maxAttempts: formData.get("maxAttempts"),
    shuffleQuestions: formData.get("shuffleQuestions"),
    shuffleChoices: formData.get("shuffleChoices"),
    passingPct: formData.get("passingPct"),
    showAnswers: formData.get("showAnswers"),
    availableFrom: formData.get("availableFrom"),
    availableUntil: formData.get("availableUntil"),
    questionIds: readJsonArray(formData.get("questionIds")),
    pool: readJsonArray(formData.get("pool")),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบการตั้งค่าอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  // แบบทดสอบที่แก้ต้องอยู่ในคอร์สนี้จริง (ไม่เชื่อคู่ courseId/quizId จากฟอร์ม)
  if (quizId) {
    const existing = await db.quiz.findFirst({ where: { id: quizId, courseId: courseId.data }, select: { id: true } });
    if (!existing) return { ok: false, message: "ไม่พบแบบทดสอบ" };
  }

  // ข้อสอบต้องเป็นของคอร์สนี้ทั้งหมด
  if (data.questionIds.length > 0) {
    const owned = await db.question.count({ where: { id: { in: data.questionIds }, courseId: courseId.data } });
    if (owned !== data.questionIds.length) {
      return { ok: false, message: "มีข้อสอบที่ไม่อยู่ในคลังของคอร์สนี้", fieldErrors: { questionIds: "เลือกข้อสอบใหม่อีกครั้ง" } };
    }
  }

  // บทเรียนที่ผูกต้องเป็นบทชนิดแบบทดสอบของคอร์สนี้ และยังไม่ผูกกับแบบทดสอบอื่น
  if (data.lessonId) {
    const lesson = await db.lesson.findFirst({
      where: { id: data.lessonId, type: LessonType.QUIZ, section: { courseId: courseId.data } },
      select: { quiz: { select: { id: true } } },
    });
    if (!lesson) return { ok: false, message: "ไม่พบบทเรียน", fieldErrors: { lessonId: "เลือกบทชนิดแบบทดสอบของคอร์สนี้" } };
    if (lesson.quiz && lesson.quiz.id !== quizId) {
      return { ok: false, message: "บทนี้ผูกกับแบบทดสอบอื่นแล้ว", fieldErrors: { lessonId: "บทนี้ผูกกับแบบทดสอบอื่นแล้ว" } };
    }
  }

  const fields = {
    title: data.title,
    lessonId: data.lessonId,
    timeLimitMin: data.timeLimitMin,
    maxAttempts: data.maxAttempts,
    shuffleQuestions: data.shuffleQuestions,
    shuffleChoices: data.shuffleChoices,
    passingPct: data.passingPct,
    showAnswers: data.showAnswers,
    availableFrom: data.availableFrom,
    availableUntil: data.availableUntil,
    randomPool: data.pool.length > 0 ? data.pool : Prisma.DbNull,
  };
  const links = data.questionIds.map((questionId, position) => ({ questionId, position }));

  const saved = await db.$transaction(async (tx) => {
    if (quizId) {
      await tx.quizQuestion.deleteMany({ where: { quizId } });
      return tx.quiz.update({
        where: { id: quizId },
        data: { ...fields, questions: { create: links } },
        select: { id: true },
      });
    }
    return tx.quiz.create({
      data: { courseId: courseId.data, ...fields, questions: { create: links } },
      select: { id: true },
    });
  });

  await writeAudit({
    actorId: user.id,
    action: quizId ? "quiz.update" : "quiz.create",
    entity: "Quiz",
    entityId: saved.id,
    after: {
      title: data.title,
      lessonId: data.lessonId,
      questions: data.questionIds.length,
      pool: data.pool,
      passingPct: data.passingPct,
      timeLimitMin: data.timeLimitMin,
      maxAttempts: data.maxAttempts,
    },
  });

  revalidateQuizzes(courseId.data);
  return {
    ok: true,
    message: quizId ? "บันทึกการตั้งค่าแบบทดสอบแล้ว — มีผลกับการสอบครั้งถัดไป" : "สร้างแบบทดสอบแล้ว",
    quizId: saved.id,
  };
}

/** ลบได้เฉพาะแบบทดสอบที่ยังไม่มีใครสอบ — มีผลสอบแล้วต้องเก็บไว้เป็นหลักฐาน */
export async function deleteQuiz(formData: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("quizId"));
  if (!id.success) return { ok: false, message: "ไม่พบแบบทดสอบ" };

  const quiz = await db.quiz.findUnique({
    where: { id: id.data },
    select: { id: true, courseId: true, title: true, _count: { select: { attempts: true } } },
  });
  if (!quiz) return { ok: false, message: "ไม่พบแบบทดสอบ" };
  const { user } = await assertCourseAccess(quiz.courseId, "teach");

  if (quiz._count.attempts > 0) {
    return { ok: false, message: `มีผู้สอบแล้ว ${quiz._count.attempts} ครั้ง จึงลบไม่ได้ — ปิดด้วยการตั้งเวลาปิดแทน` };
  }

  await db.quiz.delete({ where: { id: quiz.id } });
  await writeAudit({ actorId: user.id, action: "quiz.delete", entity: "Quiz", entityId: quiz.id, before: { title: quiz.title } });

  revalidateQuizzes(quiz.courseId);
  return { ok: true, message: "ลบแบบทดสอบแล้ว" };
}

/* ─────────────────────────── ผู้เรียน (FR-07.5) ─────────────────────────── */

export type StartAttemptResult = ActionResult & { attemptId?: string };

/**
 * เริ่มทำ (หรือทำต่อ) — ตรวจสิทธิ์ผ่าน `getLessonAccess()` แล้วเช็คช่วงเวลาและจำนวนครั้ง
 * attempt ที่ยังเปิดอยู่ถูกคืนให้ทำต่อ ไม่สร้างใหม่ (เปิดหลายแท็บก็ได้ชุดข้อเดียวกัน)
 */
export async function startAttempt(formData: FormData): Promise<StartAttemptResult> {
  const lessonId = idSchema.safeParse(formData.get("lessonId"));
  if (!lessonId.success) return { ok: false, message: "ไม่พบแบบทดสอบ" };

  const access = await getLessonAccess(lessonId.data);
  if (!access) return { ok: false, message: "ไม่พบบทเรียน" };
  if (!access.enrollmentId) return { ok: false, message: "ผู้สอนและผู้ดูแลดูได้แต่ทำแบบทดสอบไม่ได้" };
  if (!access.unlocked) return { ok: false, message: "ต้องเรียนบทก่อนหน้าให้จบก่อน" };

  const quiz = await db.quiz.findUnique({
    where: { lessonId: lessonId.data },
    select: {
      id: true,
      timeLimitMin: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleChoices: true,
      randomPool: true,
      availableFrom: true,
      availableUntil: true,
      questions: {
        orderBy: { position: "asc" },
        where: { question: { archivedAt: null } },
        select: {
          question: {
            select: { id: true, type: true, points: true, tags: true, choices: { orderBy: { position: "asc" }, select: { id: true, matchKey: true } } },
          },
        },
      },
    },
  });
  if (!quiz) return { ok: false, message: "บทนี้ยังไม่มีแบบทดสอบ" };

  const attempts = await db.quizAttempt.findMany({
    where: { quizId: quiz.id, userId: access.userId },
    select: { id: true, status: true, expiresAt: true },
  });
  for (const a of attempts) {
    if (a.status !== AttemptStatus.IN_PROGRESS) continue;
    if (!(await closeIfOverdue(a))) return { ok: true, message: "ทำแบบทดสอบต่อ", attemptId: a.id };
  }

  const now = new Date();
  const state = quizOpenState(quiz, now);
  if (state === "not-yet") return { ok: false, message: "แบบทดสอบยังไม่เปิด" };
  if (state === "closed") return { ok: false, message: "แบบทดสอบปิดแล้ว" };
  if (quiz.maxAttempts !== null && attempts.length >= quiz.maxAttempts) {
    return { ok: false, message: "ใช้สิทธิ์ทำครบจำนวนครั้งแล้ว" };
  }

  const pool = parsePool(quiz.randomPool);
  const bank = pool.length
    ? await db.question.findMany({
        where: { courseId: access.courseId, archivedAt: null, tags: { hasSome: pool.map((r) => r.tag) } },
        select: { id: true, type: true, points: true, tags: true, choices: { orderBy: { position: "asc" }, select: { id: true, matchKey: true } } },
      })
    : [];
  const toDraw = (q: (typeof bank)[number]) => ({ ...q, points: toScore(q.points) });

  const slots = drawAttempt({
    fixed: quiz.questions.map((link) => toDraw(link.question)),
    bank: bank.map(toDraw),
    pool,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleChoices: quiz.shuffleChoices,
  });
  if (slots.length === 0) return { ok: false, message: "แบบทดสอบนี้ยังไม่มีข้อสอบ — แจ้งผู้สอน" };

  try {
    const attempt = await db.quizAttempt.create({
      data: {
        quizId: quiz.id,
        userId: access.userId,
        attemptNo: attempts.length + 1,
        questionOrder: slots,
        startedAt: now,
        expiresAt: attemptDeadline(now, quiz.timeLimitMin, quiz.availableUntil),
      },
      select: { id: true },
    });
    await writeAudit({
      actorId: access.userId,
      action: "quiz.start",
      entity: "QuizAttempt",
      entityId: attempt.id,
      after: { quizId: quiz.id, attemptNo: attempts.length + 1, questions: slots.length },
    });
    return { ok: true, message: "เริ่มทำแบบทดสอบ", attemptId: attempt.id };
  } catch (error) {
    // กดเริ่มพร้อมกันสองแท็บ — unique [quizId, userId, attemptNo] กันไว้ แล้วคืน attempt ที่อีกแท็บสร้าง
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId: access.userId, status: AttemptStatus.IN_PROGRESS },
        select: { id: true },
      });
      if (existing) return { ok: true, message: "ทำแบบทดสอบต่อ", attemptId: existing.id };
    }
    throw error;
  }
}

/** โหลด attempt ของตัวเองที่ยังเปิดอยู่ — ใช้ร่วมระหว่างบันทึกคำตอบและส่ง */
async function ownOpenAttempt(attemptId: unknown) {
  const user = await requireUser();
  const id = idSchema.safeParse(attemptId);
  if (!id.success) return { error: "ไม่พบแบบทดสอบ" } as const;

  const attempt = await db.quizAttempt.findUnique({
    where: { id: id.data },
    select: { id: true, userId: true, status: true, expiresAt: true, questionOrder: true, quiz: { select: { courseId: true } } },
  });
  if (!attempt || attempt.userId !== user.id) return { error: "ไม่พบแบบทดสอบ" } as const;
  if (attempt.status !== AttemptStatus.IN_PROGRESS) return { error: "ส่งแบบทดสอบนี้ไปแล้ว", closed: true } as const;
  // ถูกถอนหรือหมดสิทธิ์กลางคัน ทำต่อไม่ได้
  await assertCourseAccess(attempt.quiz.courseId, "learn");
  return { attempt, user } as const;
}

/**
 * FR-07.5 — บันทึกคำตอบทีละข้อทันที (autosave)
 * ไม่ตรวจถูก/ผิดตอนนี้ และไม่เขียน AuditLog (เรียกถี่มาก) — ตรวจและบันทึกผลตอนส่งครั้งเดียว
 */
export async function saveAnswer(input: {
  attemptId: string;
  questionId: string;
  response: unknown;
}): Promise<ActionResult & { closed?: boolean }> {
  const loaded = await ownOpenAttempt(input.attemptId);
  if ("error" in loaded) return { ok: false, message: loaded.error!, closed: "closed" in loaded };
  const { attempt } = loaded;

  if (!acceptsAnswers(attempt.expiresAt, new Date())) {
    await closeIfOverdue(attempt);
    return { ok: false, message: "หมดเวลาแล้ว ระบบส่งคำตอบให้อัตโนมัติ", closed: true };
  }

  const slot = parseSlots(attempt.questionOrder).find((s) => s.q === input.questionId);
  if (!slot) return { ok: false, message: "ไม่พบข้อสอบนี้ในชุดของคุณ" };

  const question = await db.question.findUnique({ where: { id: slot.q }, select: { type: true } });
  if (!question) return { ok: false, message: "ไม่พบข้อสอบ" };

  const parsed = responseSchemaFor(question.type).safeParse(input.response);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "คำตอบไม่ถูกต้อง" };

  // id ของตัวเลือกต้องอยู่ในชุดที่ผู้เรียนคนนี้ได้รับจริง
  const r = parsed.data as Record<string, unknown>;
  const offered = new Set(slot.c);
  const picked = [
    ...(typeof r.choiceId === "string" ? [r.choiceId] : []),
    ...(Array.isArray(r.choiceIds) ? (r.choiceIds as string[]) : []),
    ...(r.pairs ? Object.keys(r.pairs as object) : []),
  ];
  if (picked.some((id) => !offered.has(id))) return { ok: false, message: "ตัวเลือกไม่ถูกต้อง" };
  if (r.pairs && slot.r) {
    const rights = new Set(slot.r);
    if (Object.values(r.pairs as Record<string, string>).some((v) => !rights.has(v))) {
      return { ok: false, message: "ตัวเลือกไม่ถูกต้อง" };
    }
  }

  await db.answer.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: slot.q } },
    create: { attemptId: attempt.id, questionId: slot.q, response: parsed.data },
    update: { response: parsed.data },
  });
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function submitAttempt(formData: FormData): Promise<ActionResult> {
  const loaded = await ownOpenAttempt(formData.get("attemptId"));
  if ("error" in loaded) return { ok: "closed" in loaded, message: loaded.error! };

  const reason = acceptsAnswers(loaded.attempt.expiresAt, new Date()) ? "submit" : "timeout";
  const result = await finalizeAttempt(loaded.attempt.id, reason);

  revalidatePath(`/quiz/${loaded.attempt.id}`);
  revalidatePath("/learn", "layout");
  revalidatePath("/my-courses");

  if (!result.finalized) return { ok: true, message: "ส่งแบบทดสอบนี้ไปแล้ว" };
  return {
    ok: true,
    message:
      result.passed === null
        ? "ส่งคำตอบแล้ว — รอผู้สอนตรวจข้ออัตนัย"
        : result.passed
          ? "ส่งคำตอบแล้ว — ผ่านแบบทดสอบ"
          : "ส่งคำตอบแล้ว — ยังไม่ผ่านเกณฑ์",
  };
}

/* ─────────────────────────── ผู้สอนตรวจ (FR-07.4) ─────────────────────────── */

/**
 * ให้คะแนนข้ออัตนัย และ/หรือเขียน feedback รายข้อ (ข้อชนิดอื่นให้ได้แค่ feedback — คะแนนมาจากการตรวจอัตโนมัติ)
 * แก้คะแนนหลังตรวจเสร็จแล้วได้ · คำนวณผลรวมใหม่ทุกครั้ง
 *
 * ตรวจสิทธิ์ตามคอร์สที่ attempt สังกัดจริง ไม่ใช่ค่าที่ฟอร์มส่งมา
 * ล็อกแถว attempt ระหว่างคำนวณ — ผู้สอนสองคนตรวจคนละข้อพร้อมกันแล้วผลรวม/สถานะไม่ทับกัน
 */
export async function reviewAnswer(formData: FormData): Promise<ActionResult> {
  const attemptId = idSchema.safeParse(formData.get("attemptId"));
  const questionId = idSchema.safeParse(formData.get("questionId"));
  if (!attemptId.success || !questionId.success) return { ok: false, message: "ไม่พบคำตอบ" };

  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId.data },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      questionOrder: true,
      quiz: { select: { id: true, title: true, courseId: true, lessonId: true, passingPct: true } },
    },
  });
  if (!attempt) return { ok: false, message: "ไม่พบผลสอบ" };
  const { user } = await assertCourseAccess(attempt.quiz.courseId, "teach");

  if (attempt.status === AttemptStatus.IN_PROGRESS && !(await closeIfOverdue(attempt))) {
    return { ok: false, message: "ผู้เรียนยังทำแบบทดสอบนี้ไม่เสร็จ" };
  }

  const slots = parseSlots(attempt.questionOrder);
  const slot = slots.find((s) => s.q === questionId.data);
  if (!slot) return { ok: false, message: "ไม่พบข้อนี้ในชุดข้อสอบของผู้เรียน" };

  const questions = await db.question.findMany({
    where: { id: { in: slots.map((s) => s.q) } },
    select: { id: true, type: true },
  });
  const types = new Map(questions.map((q) => [q.id, q.type]));
  const isEssay = types.get(slot.q) === QuestionType.ESSAY;

  const parsed = reviewAnswerSchema.safeParse({ score: formData.get("score"), feedback: formData.get("feedback") });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { feedback } = parsed.data;
  const score = isEssay ? parsed.data.score : null;
  if (isEssay) {
    const error = score === null ? "กรอกคะแนนของข้อนี้" : essayScoreError(score, slot.p);
    if (error) return { ok: false, message: error, fieldErrors: { score: error } };
  }

  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "QuizAttempt" WHERE id = ${attempt.id} FOR UPDATE`;
    const current = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: {
        status: true,
        score: true,
        passed: true,
        answers: { select: { questionId: true, score: true, feedback: true } },
      },
    });
    if (current.status === AttemptStatus.IN_PROGRESS) return null;

    const before = current.answers.find((a) => a.questionId === slot.q) ?? null;
    await tx.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: slot.q } },
      // ข้อที่ผู้เรียนไม่ได้ตอบไม่มีแถวคำตอบ — สร้างเปล่า ๆ เพื่อเก็บคะแนน/ความเห็น
      create: {
        attemptId: attempt.id,
        questionId: slot.q,
        response: isEssay ? { text: "" } : {},
        score: isEssay ? score : 0,
        isCorrect: isEssay ? null : false,
        feedback,
      },
      update: isEssay ? { score, feedback } : { feedback },
    });

    const answers = new Map(current.answers.map((a) => [a.questionId, { score: toScore(a.score) }]));
    answers.set(slot.q, { score: isEssay ? score : (toScore(before?.score) ?? 0) });
    const totals = recomputeAttempt(slots, types, answers, attempt.quiz.passingPct);

    await tx.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        status: totals.pending ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED,
        score: totals.score,
        maxScore: totals.maxScore,
        passed: totals.passed,
      },
    });

    return {
      before: { score: toScore(before?.score), feedback: before?.feedback ?? null },
      wasStatus: current.status,
      wasScore: toScore(current.score),
      wasPassed: current.passed,
      totals,
    };
  });
  if (!outcome) return { ok: false, message: "ผู้เรียนยังทำแบบทดสอบนี้ไม่เสร็จ" };

  const { totals } = outcome;
  await writeAudit({
    actorId: user.id,
    action: "quiz.review",
    entity: "QuizAttempt",
    entityId: attempt.id,
    before: {
      questionId: slot.q,
      ...outcome.before,
      attemptScore: outcome.wasScore,
      passed: outcome.wasPassed,
    },
    after: {
      questionId: slot.q,
      score: isEssay ? score : outcome.before.score,
      feedback,
      attemptScore: totals.score,
      passed: totals.passed,
    },
  });

  const becameGraded = outcome.wasStatus === AttemptStatus.SUBMITTED && !totals.pending;
  const regraded =
    outcome.wasStatus === AttemptStatus.GRADED &&
    (outcome.wasScore !== totals.score || outcome.wasPassed !== totals.passed);
  if (becameGraded || regraded) {
    await notify({
      userIds: [attempt.userId],
      type: NotificationType.GRADED,
      title: becameGraded
        ? `ผู้สอนตรวจแบบทดสอบ “${attempt.quiz.title}” แล้ว`
        : `ผู้สอนแก้คะแนนแบบทดสอบ “${attempt.quiz.title}”`,
      body: `ได้ ${formatScore(totals.score)}/${formatScore(totals.maxScore)} คะแนน · ${totals.passed ? "ผ่าน" : "ยังไม่ผ่านเกณฑ์"}`,
      link: `/quiz/${attempt.id}`,
    });
  }
  // ผ่านครั้งแรกเพราะคะแนนอัตนัย → บทแบบทดสอบนับว่าจบ · ผลที่ลดจากผ่านเป็นไม่ผ่านไม่ย้อนความคืบหน้า
  if (totals.passed && outcome.wasPassed !== true) {
    await recordPass(attempt.userId, attempt.quiz.courseId, attempt.quiz.lessonId);
  }

  revalidatePath(`/teach/courses/${attempt.quiz.courseId}/quizzes`, "layout");
  revalidatePath(`/quiz/${attempt.id}`);
  revalidatePath("/learn", "layout");

  return {
    ok: true,
    message: becameGraded
      ? "บันทึกแล้ว — ตรวจครบทุกข้อและแจ้งผลผู้เรียนแล้ว"
      : totals.pending
        ? "บันทึกแล้ว — ยังมีข้ออัตนัยรอตรวจ"
        : "บันทึกแล้ว",
  };
}
