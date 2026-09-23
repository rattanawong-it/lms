import "server-only";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import { toScore } from "@/lib/decimal";
import type { Prisma } from "@/generated/prisma/client";
import { QUESTION_PAGE_SIZE, type QuestionFilter } from "@/features/questions/schemas";

/** M07 · FR-07.1 — คลังข้อสอบรายคอร์ส (ผู้สอนของคอร์ส หรือผู้ดูแลคณะเจ้าของคอร์ส) */

const questionSelect = {
  id: true,
  type: true,
  prompt: true,
  explanation: true,
  points: true,
  tags: true,
  archivedAt: true,
  createdAt: true,
  choices: {
    select: { id: true, text: true, isCorrect: true, matchKey: true },
    orderBy: { position: "asc" },
  },
  _count: { select: { answers: true, quizLinks: true } },
} satisfies Prisma.QuestionSelect;

type QuestionRow = Prisma.QuestionGetPayload<{ select: typeof questionSelect }>;

/** รูปที่ส่งให้ Client Component ได้ — `Decimal` แปลงเป็น number แล้ว */
function serialize(q: QuestionRow) {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation,
    points: toScore(q.points),
    tags: q.tags,
    archived: q.archivedAt !== null,
    choices: q.choices,
    /** จำนวนครั้งที่มีผู้ตอบ — แก้เฉลยแล้วคะแนนเก่าจะไม่ถูกคิดใหม่ */
    answerCount: q._count.answers,
    quizCount: q._count.quizLinks,
  };
}

export type BankQuestion = ReturnType<typeof serialize>;

/** เครื่องหมาย % _ \ ในคำค้นต้องไม่กลายเป็น wildcard ของ LIKE */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * ค้นในโจทย์ — โจทย์เป็น Tiptap JSON ที่ข้อความซ้อนอยู่หลายชั้น Prisma จึงกรองให้ไม่ได้
 * ใช้ `prompt::text ILIKE` แบบส่งพารามิเตอร์ (ไม่ต่อสตริง SQL) และรวมแท็กที่ตรงคำค้นด้วย
 */
async function searchPromptIds(courseId: string, q: string): Promise<string[]> {
  const pattern = `%${escapeLike(q)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Question"
    WHERE "courseId" = ${courseId}
      AND ("prompt"::text ILIKE ${pattern} OR ${q} = ANY("tags"))
  `;
  return rows.map((row) => row.id);
}

export async function getQuestionBank(courseId: string, filter: QuestionFilter) {
  await assertCourseAccess(courseId, "teach");

  const where: Prisma.QuestionWhereInput = {
    courseId,
    archivedAt: filter.archived ? { not: null } : null,
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.tag ? { tags: { has: filter.tag } } : {}),
    ...(filter.q ? { id: { in: await searchPromptIds(courseId, filter.q) } } : {}),
  };

  const [course, total, questions, tagRows, activeCount, archivedCount] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.question.count({ where }),
    db.question.findMany({
      where,
      select: questionSelect,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * QUESTION_PAGE_SIZE,
      take: QUESTION_PAGE_SIZE,
    }),
    db.question.findMany({ where: { courseId, archivedAt: null }, select: { tags: true } }),
    db.question.count({ where: { courseId, archivedAt: null } }),
    db.question.count({ where: { courseId, archivedAt: { not: null } } }),
  ]);

  const tags = [...new Set(tagRows.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b, "th"));

  return {
    course,
    questions: questions.map(serialize),
    tags,
    total,
    activeCount,
    archivedCount,
    page: filter.page,
    pageCount: Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)),
  };
}
