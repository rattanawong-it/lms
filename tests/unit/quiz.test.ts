import { describe, expect, it } from "vitest";
import { QuestionType, ShowAnswers } from "@/generated/prisma/enums";
import { fromBangkokInput, toBangkokInput } from "@/lib/dates";
import {
  gradeAnswer,
  isBlankResponse,
  normalizeShortText,
  totalAttempt,
  type GradableQuestion,
} from "@/features/quiz/lib/grading";
import {
  acceptsAnswers,
  attemptDeadline,
  canRevealAnswers,
  DEADLINE_GRACE_MS,
  drawAttempt,
  parsePool,
  parseSlots,
  quizOpenState,
  type DrawQuestion,
} from "@/features/quiz/lib/attempt";
import { quizSettingsSchema, responseSchemaFor } from "@/features/quiz/schemas";

const c = (id: string, isCorrect = false, matchKey: string | null = null, text = id) => ({
  id,
  text,
  isCorrect,
  matchKey,
});

describe("gradeAnswer (FR-07.4)", () => {
  const single: GradableQuestion = { type: QuestionType.SINGLE, points: 2, choices: [c("a"), c("b", true)] };

  it("ปรนัยตอบเดียว / ถูก-ผิด", () => {
    expect(gradeAnswer(single, { choiceId: "b" })).toEqual({ isCorrect: true, score: 2 });
    expect(gradeAnswer(single, { choiceId: "a" })).toEqual({ isCorrect: false, score: 0 });
    expect(gradeAnswer(single, { choiceId: "zzz" })).toEqual({ isCorrect: false, score: 0 });
    expect(gradeAnswer(single, null)).toEqual({ isCorrect: false, score: 0 });
  });

  it("หลายคำตอบต้องถูกครบพอดี — ติ๊กเกินหรือขาดได้ 0 (Q1)", () => {
    const q: GradableQuestion = { type: QuestionType.MULTIPLE, points: 3, choices: [c("a", true), c("b"), c("c", true)] };
    expect(gradeAnswer(q, { choiceIds: ["c", "a"] }).score).toBe(3);
    expect(gradeAnswer(q, { choiceIds: ["a"] }).score).toBe(0);
    expect(gradeAnswer(q, { choiceIds: ["a", "b", "c"] }).score).toBe(0);
  });

  it("จับคู่ได้คะแนนตามสัดส่วนคู่ที่ถูก (Q1)", () => {
    const q: GradableQuestion = {
      type: QuestionType.MATCHING,
      points: 3,
      choices: [c("l1", true, "x"), c("l2", true, "y"), c("l3", true, "z")],
    };
    expect(gradeAnswer(q, { pairs: { l1: "x", l2: "y", l3: "z" } })).toEqual({ isCorrect: true, score: 3 });
    expect(gradeAnswer(q, { pairs: { l1: "x", l2: "z" } })).toEqual({ isCorrect: false, score: 1 });
    expect(gradeAnswer({ ...q, points: 1 }, { pairs: { l1: "x" } }).score).toBe(0.33);
  });

  it("เติมคำไม่สนตัวพิมพ์ ช่องว่างหัวท้าย และช่องว่างซ้อน", () => {
    const q: GradableQuestion = {
      type: QuestionType.SHORT_TEXT,
      points: 1,
      choices: [c("s1", true, null, "Cascading Style Sheets"), c("s2", true, null, "CSS")],
    };
    expect(gradeAnswer(q, { text: "  css " }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { text: "cascading   style sheets" }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { text: "HTML" }).isCorrect).toBe(false);
    expect(normalizeShortText(" กรุงเทพฯ ")).toBe("กรุงเทพฯ");
  });

  it("อัตนัยยังไม่ตรวจ (null)", () => {
    expect(gradeAnswer({ type: QuestionType.ESSAY, points: 5, choices: [] }, { text: "ยาว ๆ" })).toEqual({
      isCorrect: null,
      score: null,
    });
  });

  it("isBlankResponse", () => {
    expect(isBlankResponse(undefined)).toBe(true);
    expect(isBlankResponse({ choiceIds: [] })).toBe(true);
    expect(isBlankResponse({ text: "  " })).toBe(true);
    expect(isBlankResponse({ pairs: { a: "x" } })).toBe(false);
  });
});

describe("totalAttempt", () => {
  it("รวมคะแนนและตัดสินผ่านตามเปอร์เซ็นต์", () => {
    const t = totalAttempt(
      [
        { points: 2, score: 2, pendingReview: false },
        { points: 3, score: 1, pendingReview: false },
      ],
      60,
    );
    expect(t).toEqual({ score: 3, maxScore: 5, pending: false, pct: 60, passed: true });
  });

  it("มีข้ออัตนัยรอตรวจ → ยังไม่ตัดสิน", () => {
    const t = totalAttempt(
      [
        { points: 2, score: 2, pendingReview: false },
        { points: 5, score: null, pendingReview: true },
      ],
      50,
    );
    expect(t.passed).toBeNull();
    expect(t.pending).toBe(true);
    expect(t.score).toBe(2);
  });
});

describe("drawAttempt (FR-07.3)", () => {
  const q = (id: string, tags: string[], type: QuestionType = QuestionType.SINGLE): DrawQuestion => ({
    id,
    type,
    points: 1,
    tags,
    choices: [
      { id: `${id}-1`, matchKey: type === QuestionType.MATCHING ? "A" : null },
      { id: `${id}-2`, matchKey: type === QuestionType.MATCHING ? "B" : null },
      { id: `${id}-3`, matchKey: type === QuestionType.MATCHING ? "C" : null },
    ],
  });
  /** RNG แบบกำหนดได้ — ผลซ้ำได้ทุกครั้ง */
  const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  it("ข้อตายตัวมาก่อน แล้วสุ่มตาม tag โดยไม่ซ้ำข้อที่ได้แล้ว", () => {
    const bank = [q("f1", ["ch1"]), q("b1", ["ch1"]), q("b2", ["ch1"]), q("b3", ["ch2"])];
    const slots = drawAttempt(
      { fixed: [bank[0]!], bank, pool: [{ tag: "ch1", count: 5 }], shuffleQuestions: false, shuffleChoices: false },
      seeded(),
    );
    expect(slots[0]!.q).toBe("f1");
    expect(slots.map((s) => s.q).sort()).toEqual(["b1", "b2", "f1"]);
  });

  it("ไม่สลับ = ลำดับเดิม · สลับตัวเลือกแต่ไม่สลับข้อถูก/ผิด", () => {
    const tf: DrawQuestion = { ...q("tf", [], QuestionType.TRUE_FALSE), choices: [{ id: "t", matchKey: null }, { id: "f", matchKey: null }] };
    const slots = drawAttempt(
      { fixed: [q("a", []), tf], bank: [], pool: [], shuffleQuestions: false, shuffleChoices: true },
      seeded(7),
    );
    expect(slots.map((s) => s.q)).toEqual(["a", "tf"]);
    expect(new Set(slots[0]!.c)).toEqual(new Set(["a-1", "a-2", "a-3"]));
    expect(slots[1]!.c).toEqual(["t", "f"]);
  });

  it("จับคู่ส่งฝั่งขวาแบบไม่ซ้ำ · เติมคำ/อัตนัยไม่ส่งตัวเลือก", () => {
    const [matching, short] = drawAttempt(
      {
        fixed: [q("m", [], QuestionType.MATCHING), q("s", [], QuestionType.SHORT_TEXT)],
        bank: [],
        pool: [],
        shuffleQuestions: false,
        shuffleChoices: false,
      },
      seeded(),
    );
    expect(new Set(matching!.r)).toEqual(new Set(["A", "B", "C"]));
    expect(short!.c).toEqual([]);
  });

  it("parseSlots / parsePool ทิ้งข้อมูลเสีย", () => {
    expect(parseSlots([{ q: "a", p: 1, c: ["x"] }, { q: 1 }, null])).toEqual([{ q: "a", p: 1, c: ["x"] }]);
    expect(parsePool([{ tag: "a", count: 2 }, { tag: "b", count: 0 }, "x"])).toEqual([{ tag: "a", count: 2 }]);
  });
});

describe("เวลาและการเปิดเฉลย (FR-07.5 · FR-07.6)", () => {
  const t = (iso: string) => new Date(iso);

  it("เวลาสิ้นสุด = เร็วกว่าระหว่างเวลาที่กำหนดกับเวลาปิด", () => {
    const start = t("2026-09-23T03:00:00Z");
    expect(attemptDeadline(start, 30, null)).toEqual(t("2026-09-23T03:30:00Z"));
    expect(attemptDeadline(start, 30, t("2026-09-23T03:10:00Z"))).toEqual(t("2026-09-23T03:10:00Z"));
    expect(attemptDeadline(start, null, null)).toBeNull();
  });

  it("รับคำตอบต่อได้ในช่วงเผื่อเท่านั้น", () => {
    const end = t("2026-09-23T03:30:00Z");
    expect(acceptsAnswers(end, new Date(end.getTime() + DEADLINE_GRACE_MS))).toBe(true);
    expect(acceptsAnswers(end, new Date(end.getTime() + DEADLINE_GRACE_MS + 1))).toBe(false);
    expect(acceptsAnswers(null, end)).toBe(true);
  });

  it("สถานะเปิด-ปิด", () => {
    const quiz = { availableFrom: t("2026-09-23T00:00:00Z"), availableUntil: t("2026-09-24T00:00:00Z") };
    expect(quizOpenState(quiz, t("2026-09-22T23:59:59Z"))).toBe("not-yet");
    expect(quizOpenState(quiz, t("2026-09-23T12:00:00Z"))).toBe("open");
    expect(quizOpenState(quiz, t("2026-09-24T00:00:00Z"))).toBe("closed");
  });

  it("เฉลย: ทันที / หลังปิด / ไม่แสดง", () => {
    const until = t("2026-09-24T00:00:00Z");
    expect(canRevealAnswers(ShowAnswers.IMMEDIATELY, null, t("2026-01-01T00:00:00Z"))).toBe(true);
    expect(canRevealAnswers(ShowAnswers.AFTER_CLOSE, until, t("2026-09-23T00:00:00Z"))).toBe(false);
    expect(canRevealAnswers(ShowAnswers.AFTER_CLOSE, until, until)).toBe(true);
    expect(canRevealAnswers(ShowAnswers.AFTER_CLOSE, null, until)).toBe(false);
    expect(canRevealAnswers(ShowAnswers.NEVER, until, t("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("datetime-local ตีความเป็นเวลาไทย", () => {
    expect(fromBangkokInput("2026-09-30T13:00")?.toISOString()).toBe("2026-09-30T06:00:00.000Z");
    expect(toBangkokInput(new Date("2026-09-30T06:00:00Z"))).toBe("2026-09-30T13:00");
    expect(fromBangkokInput("30/09/2026")).toBeNull();
  });
});

describe("quizSettingsSchema", () => {
  const base = {
    title: "สอบกลางภาค",
    passingPct: "60",
    showAnswers: ShowAnswers.IMMEDIATELY,
    questionIds: ["q1"],
    pool: [],
  };

  it("ช่องว่าง = ไม่จำกัด และ checkbox แปลงถูก", () => {
    const parsed = quizSettingsSchema.parse({ ...base, timeLimitMin: "", maxAttempts: null, shuffleQuestions: "on" });
    expect(parsed).toMatchObject({ timeLimitMin: null, maxAttempts: null, shuffleQuestions: true, shuffleChoices: false, lessonId: null });
  });

  it("ต้องมีข้อสอบหรือกฎสุ่ม · เวลาปิดต้องหลังเวลาเปิด · เฉลยหลังปิดต้องมีเวลาปิด", () => {
    const issues = (input: Record<string, unknown>) =>
      quizSettingsSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.message) ?? [];
    expect(issues({ questionIds: [] })).toContain("เลือกข้อสอบหรือกำหนดการสุ่มจากแท็กอย่างน้อย 1 อย่าง");
    expect(issues({ availableFrom: "2026-09-30T13:00", availableUntil: "2026-09-30T12:00" })).toContain("เวลาปิดต้องหลังเวลาเปิด");
    expect(issues({ showAnswers: ShowAnswers.AFTER_CLOSE })).toContain("“แสดงเฉลยหลังปิดแบบทดสอบ” ต้องกำหนดเวลาปิดด้วย");
    expect(issues({ timeLimitMin: "0" })).toContain("เวลาทำต้องอยู่ระหว่าง 1–600 นาที");
    expect(issues({ pool: [{ tag: "a", count: 1 }, { tag: "a", count: 2 }] })).toContain("มีกฎสุ่มจากแท็กเดียวกันซ้ำ");
  });
});

describe("responseSchemaFor", () => {
  it("ตรวจรูปคำตอบตามชนิดข้อ", () => {
    expect(responseSchemaFor(QuestionType.SINGLE).safeParse({ choiceId: "a" }).success).toBe(true);
    expect(responseSchemaFor(QuestionType.SINGLE).safeParse({ choiceIds: ["a"] }).success).toBe(false);
    expect(responseSchemaFor(QuestionType.MATCHING).safeParse({ pairs: { a: "x" } }).success).toBe(true);
    expect(responseSchemaFor(QuestionType.SHORT_TEXT).safeParse({ text: "x".repeat(201) }).success).toBe(false);
  });
});
