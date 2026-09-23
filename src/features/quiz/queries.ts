import "server-only";
import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { toScore } from "@/lib/decimal";
import { richTextToPlain } from "@/components/shared/rich-text";
import { AttemptStatus, LessonType, QuestionType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getLessonAccess } from "@/features/enrollment/queries";
import { getProtectionState } from "@/features/protection/queries";
import {
  type AttemptSlot,
  canRevealAnswers,
  parsePool,
  parseSlots,
  quizOpenState,
} from "@/features/quiz/lib/attempt";
import { closeIfOverdue } from "@/features/quiz/lib/finalize";

/* ─────────────────────────── ข้อสอบในผลสอบ (ใช้ร่วมผู้เรียน/ผู้สอน) ─────────────────────────── */

type ItemQuestion = {
  id: string;
  type: QuestionType;
  prompt: Prisma.JsonValue;
  explanation?: Prisma.JsonValue | null;
  choices: { id: string; text: string; isCorrect?: boolean; matchKey?: string | null }[];
};

type ItemAnswer = {
  questionId: string;
  response: Prisma.JsonValue;
  isCorrect: boolean | null;
  score: Prisma.Decimal | null;
  feedback: string | null;
};

/**
 * เรียงข้อตาม snapshot ของ attempt แล้วประกอบคำตอบ ผล และเฉลย
 * `reveal = false` → ไม่ใส่เฉลย (ผู้เรียนก่อนถึงเวลาเปิดเฉลย) · ผู้สอนเรียกด้วย `reveal = true` เสมอ
 */
function buildItems(
  slots: AttemptSlot[],
  questions: ItemQuestion[],
  answerRows: ItemAnswer[],
  { inProgress, reveal }: { inProgress: boolean; reveal: boolean },
) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map(answerRows.map((a) => [a.questionId, a]));

  return slots.flatMap((slot, index) => {
    const q = byId.get(slot.q);
    if (!q) return [];
    const choiceById = new Map(q.choices.map((c) => [c.id, c]));
    const answer = answers.get(slot.q);
    const essay = q.type === QuestionType.ESSAY;
    return [
      {
        number: index + 1,
        questionId: q.id,
        type: q.type,
        points: slot.p,
        prompt: q.prompt,
        // ลำดับตามที่สุ่มไว้ใน snapshot · ข้อเติมคำ/อัตนัยไม่มีตัวเลือกให้เห็น
        choices:
          q.type === QuestionType.SHORT_TEXT || essay
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
              // คะแนนอัตนัยมาจากผู้สอน ไม่ได้บอกเฉลย — แสดงได้เสมอเมื่อตรวจแล้ว
              score: reveal || essay ? toScore(answer?.score ?? null) : null,
              feedback: answer?.feedback ?? null,
              pending: essay && answer !== undefined && answer.score === null,
            },
        key: reveal
          ? {
              correctChoiceIds: q.choices.filter((c) => c.isCorrect).map((c) => c.id),
              pairs: Object.fromEntries(q.choices.map((c) => [c.id, c.matchKey ?? ""])),
              accepted: q.type === QuestionType.SHORT_TEXT ? q.choices.map((c) => c.text) : [],
              explanation: q.explanation ?? null,
            }
          : null,
      },
    ];
  });
}

export type AttemptItem = ReturnType<typeof buildItems>[number];

/* ─────────────────────────── ผู้สอน (FR-07.3) ─────────────────────────── */

export async function getCourseQuizzes(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  const [course, quizzes, pending] = await Promise.all([
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
    // ข้ออัตนัยรอตรวจ (FR-07.4) — นับเป็นจำนวน attempt
    db.quizAttempt.groupBy({
      by: ["quizId"],
      where: { status: AttemptStatus.SUBMITTED, quiz: { courseId } },
      _count: { _all: true },
    }),
  ]);
  const pendingByQuiz = new Map(pending.map((p) => [p.quizId, p._count._all]));

  return {
    course,
    pendingTotal: pending.reduce((sum, p) => sum + p._count._all, 0),
    quizzes: quizzes.map((q) => ({
      ...q,
      pool: parsePool(q.randomPool),
      questionCount: q._count.questions,
      attemptCount: q._count.attempts,
      pendingCount: pendingByQuiz.get(q.id) ?? 0,
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
  const items = buildItems(slots, questions, attempt.answers, { inProgress, reveal });

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

/* ─────────────────────────── ผู้สอนดูผลและตรวจ (FR-07.4) ─────────────────────────── */

const studentSelect = { id: true, name: true, email: true, externalId: true } as const;

/** attempt ที่เลยเวลาแล้วของแบบทดสอบเหล่านี้ถูกปิดก่อนแสดงผล (ไม่มี cron) */
async function closeOverdueAttempts(where: Prisma.QuizAttemptWhereInput) {
  const overdue = await db.quizAttempt.findMany({
    where: { ...where, status: AttemptStatus.IN_PROGRESS, expiresAt: { lt: new Date() } },
    select: { id: true, status: true, expiresAt: true },
  });
  for (const a of overdue) await closeIfOverdue(a);
}

const pctOf = (score: number | null, max: number | null) =>
  score !== null && max ? Math.round((score / max) * 10000) / 100 : null;

/** ผลสอบของแบบทดสอบหนึ่ง: ผู้สอบ × ครั้งที่สอบ × คะแนน */
export async function getQuizResults(courseId: string, quizId: string) {
  await assertCourseAccess(courseId, "teach");

  const quiz = await db.quiz.findFirst({
    where: { id: quizId, courseId },
    select: { id: true, title: true, passingPct: true, maxAttempts: true, course: { select: { id: true, title: true } } },
  });
  if (!quiz) notFound();

  await closeOverdueAttempts({ quizId });

  const attempts = await db.quizAttempt.findMany({
    where: { quizId },
    orderBy: { attemptNo: "asc" },
    select: {
      id: true,
      attemptNo: true,
      status: true,
      submittedAt: true,
      score: true,
      maxScore: true,
      passed: true,
      user: { select: studentSelect },
    },
  });

  const byUser = new Map<string, { student: (typeof attempts)[number]["user"]; attempts: typeof attempts }>();
  for (const a of attempts) {
    const entry = byUser.get(a.user.id) ?? { student: a.user, attempts: [] };
    entry.attempts.push(a);
    byUser.set(a.user.id, entry);
  }

  const students = [...byUser.values()]
    .map(({ student, attempts: list }) => {
      const rows = list.map((a) => {
        const score = toScore(a.score);
        const maxScore = toScore(a.maxScore);
        return {
          id: a.id,
          attemptNo: a.attemptNo,
          status: a.status,
          submittedAt: a.submittedAt,
          score,
          maxScore,
          pct: a.status === AttemptStatus.IN_PROGRESS ? null : pctOf(score, maxScore),
          passed: a.passed,
        };
      });
      // Q2 — ครั้งที่ได้คะแนนสูงสุดคือคะแนนที่นับ (เฉพาะครั้งที่ตรวจเสร็จแล้ว)
      const graded = rows.filter((r) => r.status === AttemptStatus.GRADED);
      const best = graded.reduce<(typeof rows)[number] | null>(
        (top, r) => (top === null || (r.pct ?? 0) > (top.pct ?? 0) ? r : top),
        null,
      );
      return {
        student,
        attempts: rows,
        bestPct: best?.pct ?? null,
        passed: rows.some((r) => r.passed),
        pending: rows.some((r) => r.status === AttemptStatus.SUBMITTED),
      };
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name, "th"));

  return {
    quiz,
    students,
    summary: {
      students: students.length,
      passed: students.filter((s) => s.passed).length,
      pending: attempts.filter((a) => a.status === AttemptStatus.SUBMITTED).length,
    },
  };
}

export type QuizResults = Awaited<ReturnType<typeof getQuizResults>>;

/** คิวข้ออัตนัยรอตรวจทั้งคอร์ส — ส่งก่อนตรวจก่อน */
export async function getGradingQueue(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  await closeOverdueAttempts({ quiz: { courseId } });

  const [course, attempts] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.quizAttempt.findMany({
      where: { status: AttemptStatus.SUBMITTED, quiz: { courseId } },
      orderBy: { submittedAt: "asc" },
      select: {
        id: true,
        attemptNo: true,
        submittedAt: true,
        quiz: { select: { id: true, title: true } },
        user: { select: studentSelect },
        _count: { select: { answers: { where: { score: null } } } },
      },
    }),
  ]);

  return {
    course,
    queue: attempts.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      submittedAt: a.submittedAt,
      quiz: a.quiz,
      student: a.user,
      pendingCount: a._count.answers,
    })),
  };
}

/** คำตอบรายคนของ attempt หนึ่ง พร้อมเฉลย — ผู้สอนเห็นเฉลยเสมอไม่ขึ้นกับการตั้งค่า FR-07.6 */
export async function getAttemptReview(courseId: string, quizId: string, attemptId: string) {
  await assertCourseAccess(courseId, "teach");

  const load = () =>
    db.quizAttempt.findFirst({
      where: { id: attemptId, quizId, quiz: { courseId } },
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
        questionOrder: true,
        user: { select: studentSelect },
        answers: { select: { questionId: true, response: true, isCorrect: true, score: true, feedback: true } },
        quiz: { select: { id: true, title: true, passingPct: true, course: { select: { id: true, title: true } } } },
      },
    });

  let attempt = await load();
  if (!attempt) notFound();
  if (await closeIfOverdue(attempt)) attempt = (await load())!;

  const slots = parseSlots(attempt.questionOrder);
  const questions = await db.question.findMany({
    where: { id: { in: slots.map((s) => s.q) } },
    select: {
      id: true,
      type: true,
      prompt: true,
      explanation: true,
      choices: { select: { id: true, text: true, isCorrect: true, matchKey: true } },
    },
  });

  const inProgress = attempt.status === AttemptStatus.IN_PROGRESS;
  const items = buildItems(slots, questions, attempt.answers, { inProgress, reveal: true });
  const score = toScore(attempt.score);
  const maxScore = toScore(attempt.maxScore);

  return {
    attempt: {
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score,
      maxScore,
      pct: pctOf(score, maxScore),
      passed: attempt.passed,
    },
    student: attempt.user,
    quiz: attempt.quiz,
    items,
    pendingCount: items.filter((i) => i.result?.pending).length,
  };
}

export type AttemptReview = Awaited<ReturnType<typeof getAttemptReview>>;
