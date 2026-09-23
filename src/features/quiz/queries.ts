import "server-only";
import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { toScore } from "@/lib/decimal";
import { richTextToPlain } from "@/components/shared/rich-text";
import { AttemptStatus, LessonType, QuestionType } from "@/generated/prisma/enums";
import { getLessonAccess } from "@/features/enrollment/queries";
import { getProtectionState } from "@/features/protection/queries";
import {
  canRevealAnswers,
  parsePool,
  parseSlots,
  quizOpenState,
} from "@/features/quiz/lib/attempt";
import { closeIfOverdue } from "@/features/quiz/lib/finalize";

/* ─────────────────────────── ผู้สอน (FR-07.3) ─────────────────────────── */

export async function getCourseQuizzes(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  const [course, quizzes] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.quiz.findMany({
      where: { courseId },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        timeLimitMin: true,
        maxAttempts: true,
        passingPct: true,
        randomPool: true,
        availableFrom: true,
        availableUntil: true,
        lesson: { select: { title: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    }),
  ]);

  return {
    course,
    quizzes: quizzes.map((q) => ({
      ...q,
      pool: parsePool(q.randomPool),
      questionCount: q._count.questions,
      attemptCount: q._count.attempts,
    })),
  };
}

/** ข้อมูลของหน้าตั้งค่าแบบทดสอบ — `quizId = null` คือสร้างใหม่ */
export async function getQuizEditor(courseId: string, quizId: string | null) {
  await assertCourseAccess(courseId, "teach");

  const quiz = quizId
    ? await db.quiz.findFirst({
        where: { id: quizId, courseId },
        select: {
          id: true,
          title: true,
          lessonId: true,
          timeLimitMin: true,
          maxAttempts: true,
          shuffleQuestions: true,
          shuffleChoices: true,
          randomPool: true,
          passingPct: true,
          showAnswers: true,
          availableFrom: true,
          availableUntil: true,
          questions: { orderBy: { position: "asc" }, select: { questionId: true } },
          _count: { select: { attempts: true } },
        },
      })
    : null;
  if (quizId && !quiz) notFound();

  const selected = new Set(quiz?.questions.map((q) => q.questionId) ?? []);

  const [course, bank, lessons] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    // ข้อที่เก็บเข้าคลังเก่าแล้วแต่ยังถูกเลือกอยู่ต้องแสดงด้วย ไม่งั้นผู้สอนเอาออกจากแบบทดสอบไม่ได้
    db.question.findMany({
      where: { courseId, OR: [{ archivedAt: null }, { id: { in: [...selected] } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, prompt: true, points: true, tags: true, archivedAt: true },
    }),
    db.lesson.findMany({
      where: { type: LessonType.QUIZ, section: { courseId } },
      orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
      select: { id: true, title: true, quiz: { select: { id: true } } },
    }),
  ]);

  const tagCounts = new Map<string, number>();
  for (const q of bank) {
    if (q.archivedAt) continue;
    for (const t of q.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  return {
    course,
    quiz: quiz
      ? {
          ...quiz,
          questionIds: quiz.questions.map((q) => q.questionId),
          pool: parsePool(quiz.randomPool),
          attemptCount: quiz._count.attempts,
        }
      : null,
    bank: bank.map((q) => ({
      id: q.id,
      type: q.type,
      preview: richTextToPlain(q.prompt, 140),
      points: toScore(q.points),
      tags: q.tags,
      archived: q.archivedAt !== null,
    })),
    tags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag, "th")),
    // บทชนิดแบบทดสอบที่ยังว่าง หรือเป็นของแบบทดสอบนี้เอง
    lessons: lessons
      .filter((l) => !l.quiz || l.quiz.id === quizId)
      .map((l) => ({ id: l.id, title: l.title })),
  };
}

export type QuizEditorData = Awaited<ReturnType<typeof getQuizEditor>>;

/* ─────────────────────────── ผู้เรียน (FR-07.5) ─────────────────────────── */

/**
 * การ์ดแบบทดสอบในหน้าเรียน — ผ่านด่าน `getLessonAccess()` เดียวกับสื่อบทเรียนทุกชนิด
 * attempt ที่เลยเวลาถูกปิดให้ตรงนี้ด้วย (ไม่มี cron)
 */
export async function getLessonQuiz(lessonId: string) {
  const access = await getLessonAccess(lessonId);
  if (!access) notFound();

  const quiz = await db.quiz.findUnique({
    where: { lessonId },
    select: {
      id: true,
      title: true,
      timeLimitMin: true,
      maxAttempts: true,
      passingPct: true,
      showAnswers: true,
      availableFrom: true,
      availableUntil: true,
      randomPool: true,
      _count: { select: { questions: true } },
    },
  });
  if (!quiz) return null;

  const load = () =>
    db.quizAttempt.findMany({
      where: { quizId: quiz.id, userId: access.userId },
      orderBy: { attemptNo: "desc" },
      select: {
        id: true,
        attemptNo: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        passed: true,
      },
    });

  let attempts = await load();
  let closed = false;
  for (const a of attempts) closed = (await closeIfOverdue(a)) || closed;
  if (closed) attempts = await load();

  const now = new Date();
  const inProgress = attempts.find((a) => a.status === AttemptStatus.IN_PROGRESS) ?? null;
  const used = attempts.length;
  const openState = quizOpenState(quiz, now);
  const questionCount = quiz._count.questions + parsePool(quiz.randomPool).reduce((s, r) => s + r.count, 0);

  let blocked: string | null = null;
  if (!access.enrollmentId) blocked = "ผู้สอนและผู้ดูแลดูได้แต่ทำแบบทดสอบไม่ได้";
  else if (!access.unlocked) blocked = "ต้องเรียนบทก่อนหน้าให้จบก่อน";
  else if (openState === "not-yet") blocked = "แบบทดสอบยังไม่เปิด";
  else if (openState === "closed") blocked = "แบบทดสอบปิดแล้ว";
  else if (!inProgress && quiz.maxAttempts !== null && used >= quiz.maxAttempts) {
    blocked = "ใช้สิทธิ์ทำครบจำนวนครั้งแล้ว";
  }

  const finished = attempts.filter((a) => a.status !== AttemptStatus.IN_PROGRESS);
  const best = finished.reduce<number | null>((max, a) => {
    const s = toScore(a.score);
    const m = toScore(a.maxScore);
    if (s === null || !m) return max;
    const pct = Math.round((s / m) * 10000) / 100;
    return max === null || pct > max ? pct : max;
  }, null);

  return {
    quiz: { ...quiz, questionCount },
    openState,
    blocked,
    inProgressId: inProgress?.id ?? null,
    attemptsUsed: used,
    bestPct: best,
    passed: finished.some((a) => a.passed),
    attempts: attempts.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      status: a.status,
      submittedAt: a.submittedAt,
      score: toScore(a.score),
      maxScore: toScore(a.maxScore),
      passed: a.passed,
    })),
  };
}

export type LessonQuiz = NonNullable<Awaited<ReturnType<typeof getLessonQuiz>>>;

/**
 * หน้า `/quiz/[attemptId]` — เปิดได้เฉพาะเจ้าของ attempt
 * (ผู้สอนดูผลสอบของผู้เรียนผ่านหน้าผลสอบในขั้น 3 ไม่ใช่ที่นี่)
 *
 * ระหว่างสอบ: ส่งเฉพาะ id/ข้อความของตัวเลือก — **ไม่มี isCorrect / matchKey / คำอธิบายเฉลย**
 * หลังส่ง: เปิดเฉลยตาม `showAnswers` (FR-07.6)
 */
export async function getAttemptView(attemptId: string) {
  const user = await requireUser();

  const load = () =>
    db.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        attemptNo: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        passed: true,
        questionOrder: true,
        answers: { select: { questionId: true, response: true, isCorrect: true, score: true, feedback: true } },
        quiz: {
          select: {
            id: true,
            title: true,
            passingPct: true,
            showAnswers: true,
            availableUntil: true,
            lessonId: true,
            course: { select: { id: true, title: true, protectionEnabled: true } },
          },
        },
      },
    });

  let attempt = await load();
  if (!attempt) notFound();
  if (attempt.userId !== user.id) forbidden();
  if (await closeIfOverdue(attempt)) attempt = (await load())!;

  const { quiz } = attempt;
  const inProgress = attempt.status === AttemptStatus.IN_PROGRESS;
  // ระหว่างสอบต้องยังมีสิทธิ์เรียนอยู่ (ถูกถอน/หมดอายุกลางคันแล้วทำต่อไม่ได้)
  if (inProgress) await assertCourseAccess(quiz.course.id, "learn");

  const slots = parseSlots(attempt.questionOrder);
  const now = new Date();
  const reveal = !inProgress && canRevealAnswers(quiz.showAnswers, quiz.availableUntil, now);

  const questions = await db.question.findMany({
    where: { id: { in: slots.map((s) => s.q) } },
    select: {
      id: true,
      type: true,
      prompt: true,
      // เฉลยและคำอธิบายถูกดึงมาเฉพาะเมื่อเปิดเฉลยได้แล้วเท่านั้น
      explanation: reveal,
      choices: {
        select: { id: true, text: true, ...(reveal ? { isCorrect: true, matchKey: true } : {}) },
      },
    },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const items = slots.flatMap((slot, index) => {
    const q = byId.get(slot.q);
    if (!q) return [];
    const choiceById = new Map(q.choices.map((c) => [c.id, c]));
    const answer = answers.get(slot.q);
    return [
      {
        number: index + 1,
        questionId: q.id,
        type: q.type,
        points: slot.p,
        prompt: q.prompt,
        // ลำดับตามที่สุ่มไว้ใน snapshot · ข้อเติมคำ/อัตนัยไม่มีตัวเลือกให้เห็น
        choices:
          q.type === QuestionType.SHORT_TEXT || q.type === QuestionType.ESSAY
            ? []
            : slot.c.flatMap((id) => {
                const c = choiceById.get(id);
                return c ? [{ id: c.id, text: c.text }] : [];
              }),
        rightOptions: slot.r ?? [],
        response: answer?.response ?? null,
        result: inProgress
          ? null
          : {
              isCorrect: reveal ? (answer?.isCorrect ?? false) : null,
              score: reveal ? toScore(answer?.score ?? null) : null,
              feedback: answer?.feedback ?? null,
              pending: q.type === QuestionType.ESSAY && answer !== undefined && answer.score === null,
            },
        key: reveal
          ? {
              correctChoiceIds: q.choices.filter((c) => "isCorrect" in c && c.isCorrect).map((c) => c.id),
              pairs: Object.fromEntries(
                q.choices.map((c) => [c.id, "matchKey" in c ? (c.matchKey ?? "") : ""]),
              ),
              accepted:
                q.type === QuestionType.SHORT_TEXT ? q.choices.map((c) => c.text) : [],
              explanation: "explanation" in q ? q.explanation : null,
            }
          : null,
      },
    ];
  });

  const protection = await getProtectionState(user, quiz.course.protectionEnabled);

  return {
    attempt: {
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      score: toScore(attempt.score),
      maxScore: toScore(attempt.maxScore),
      passed: attempt.passed,
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      passingPct: quiz.passingPct,
      showAnswers: quiz.showAnswers,
      availableUntil: quiz.availableUntil,
      lessonId: quiz.lessonId,
      courseId: quiz.course.id,
      courseTitle: quiz.course.title,
    },
    reveal,
    items,
    protection,
    serverNow: now.toISOString(),
  };
}

export type AttemptView = Awaited<ReturnType<typeof getAttemptView>>;
