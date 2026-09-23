import { QuestionType } from "@/generated/prisma/enums";

/**
 * M07 · FR-07.4 — ตรวจคำตอบอัตโนมัติ (pure function — unit test ได้โดยไม่ต้องมี DB)
 *
 * กติกาที่เจ้าของระบบยืนยัน (phase-2-plan Q1):
 *   MULTIPLE — ต้องเลือกครบและไม่เกินจึงได้คะแนน (กันการติ๊กทุกข้อ)
 *   MATCHING — ได้ตามสัดส่วนคู่ที่ถูก
 *   ESSAY    — ไม่ตรวจอัตโนมัติ รอผู้สอนให้คะแนน (ขั้น 3)
 */

/** รูปของคำตอบที่ผู้เรียนส่ง — เก็บใน `Answer.response` ตามรูปนี้ */
export type QuizResponse =
  | { choiceId: string }
  | { choiceIds: string[] }
  | { pairs: Record<string, string> }
  | { text: string };

export type GradableChoice = { id: string; text: string; isCorrect: boolean; matchKey: string | null };

export type GradableQuestion = {
  type: QuestionType;
  points: number;
  choices: GradableChoice[];
};

export type GradeResult = {
  /** null = ยังไม่ได้ตรวจ (อัตนัย) */
  isCorrect: boolean | null;
  score: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ตัดช่องว่างหัวท้าย ยุบช่องว่างซ้อน ไม่สนตัวพิมพ์ และจัดรูปอักขระไทยให้เทียบกันได้ */
export function normalizeShortText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

export function gradeAnswer(question: GradableQuestion, response: unknown): GradeResult {
  const r = (response ?? {}) as Partial<Record<string, unknown>>;
  const wrong: GradeResult = { isCorrect: false, score: 0 };
  const right: GradeResult = { isCorrect: true, score: question.points };

  switch (question.type) {
    case QuestionType.SINGLE:
    case QuestionType.TRUE_FALSE: {
      const picked = question.choices.find((c) => c.id === r.choiceId);
      return picked?.isCorrect ? right : wrong;
    }

    case QuestionType.MULTIPLE: {
      const picked = new Set(Array.isArray(r.choiceIds) ? r.choiceIds.filter((v) => typeof v === "string") : []);
      const correct = question.choices.filter((c) => c.isCorrect).map((c) => c.id);
      const exact = picked.size === correct.length && correct.every((id) => picked.has(id));
      return exact ? right : wrong;
    }

    case QuestionType.MATCHING: {
      const pairs = r.pairs && typeof r.pairs === "object" ? (r.pairs as Record<string, unknown>) : {};
      const total = question.choices.length;
      if (total === 0) return wrong;
      const hits = question.choices.filter(
        (c) => typeof pairs[c.id] === "string" && pairs[c.id] === c.matchKey,
      ).length;
      return { isCorrect: hits === total, score: round2((question.points * hits) / total) };
    }

    case QuestionType.SHORT_TEXT: {
      if (typeof r.text !== "string" || !r.text.trim()) return wrong;
      const answer = normalizeShortText(r.text);
      return question.choices.some((c) => normalizeShortText(c.text) === answer) ? right : wrong;
    }

    case QuestionType.ESSAY:
      return { isCorrect: null, score: null };
  }
}

/** ยังไม่ได้ตอบเลยหรือไม่ — ใช้นับ "ข้อที่ยังไม่ตอบ" ก่อนส่ง */
export function isBlankResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return true;
  const r = response as Record<string, unknown>;
  if (typeof r.choiceId === "string") return false;
  if (Array.isArray(r.choiceIds)) return r.choiceIds.length === 0;
  if (r.pairs && typeof r.pairs === "object") return Object.keys(r.pairs).length === 0;
  if (typeof r.text === "string") return r.text.trim() === "";
  return true;
}

export type AttemptTotals = {
  score: number;
  maxScore: number;
  /** มีข้ออัตนัยที่ยังไม่ได้ตรวจ — ยังตัดสินผ่าน/ไม่ผ่านไม่ได้ */
  pending: boolean;
  /** null เมื่อยังมีข้อรอตรวจ */
  passed: boolean | null;
  pct: number;
};

/** รวมคะแนนทั้ง attempt · ผ่านเมื่อได้ ≥ passingPct ของคะแนนเต็ม และไม่มีข้อรอตรวจ */
export function totalAttempt(
  items: { points: number; score: number | null; pendingReview: boolean }[],
  passingPct: number,
): AttemptTotals {
  const maxScore = round2(items.reduce((sum, i) => sum + i.points, 0));
  const score = round2(items.reduce((sum, i) => sum + (i.score ?? 0), 0));
  const pending = items.some((i) => i.pendingReview);
  const pct = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  return { score, maxScore, pending, pct, passed: pending ? null : pct >= passingPct };
}
