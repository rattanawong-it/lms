import { QuestionType, ShowAnswers } from "@/generated/prisma/enums";

/**
 * M07 · FR-07.3 / FR-07.5 / FR-07.6 — สุ่มชุดข้อสอบ, เวลา และการเปิดเฉลย (pure function)
 */

/** ข้อสอบหนึ่งข้อใน snapshot ของ attempt (`QuizAttempt.questionOrder`) */
export type AttemptSlot = {
  /** questionId */
  q: string;
  /** คะแนนเต็ม ณ ตอนเริ่มสอบ — ผู้สอนแก้คะแนนในคลังระหว่างนั้นก็ไม่กระทบ attempt นี้ */
  p: number;
  /** ลำดับตัวเลือกที่แสดง (SINGLE/MULTIPLE/TRUE_FALSE) หรือลำดับฝั่งซ้าย (MATCHING) */
  c: string[];
  /** ตัวเลือกฝั่งขวาของข้อจับคู่ สลับลำดับแล้ว (ไม่บอกว่าคู่กับอะไร) */
  r?: string[];
};

export type DrawQuestion = {
  id: string;
  type: QuestionType;
  points: number;
  tags: string[];
  choices: { id: string; matchKey: string | null }[];
};

export type PoolRule = { tag: string; count: number };

export type DrawInput = {
  /** ข้อที่ผู้สอนเลือกไว้ตายตัว เรียงตามตำแหน่ง */
  fixed: DrawQuestion[];
  /** ข้อทั้งหมดในคลังที่ยังใช้งาน (สำหรับสุ่มตาม tag) */
  bank: DrawQuestion[];
  pool: PoolRule[];
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
};

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * สร้างชุดข้อสอบของ attempt หนึ่งครั้ง
 * ข้อตายตัวมาก่อน แล้วสุ่มจากคลังตาม tag ทีละกฎ (ไม่ซ้ำข้อที่ได้แล้ว)
 * ถ้าคลังมีไม่พอตามจำนวน จะได้เท่าที่มี — หน้าตั้งค่าเตือนผู้สอนไว้แล้ว
 */
export function drawAttempt(input: DrawInput, random: () => number = Math.random): AttemptSlot[] {
  const chosen: DrawQuestion[] = [...input.fixed];
  const used = new Set(chosen.map((q) => q.id));

  for (const rule of input.pool) {
    const candidates = shuffle(
      input.bank.filter((q) => q.tags.includes(rule.tag) && !used.has(q.id)),
      random,
    ).slice(0, rule.count);
    for (const q of candidates) {
      chosen.push(q);
      used.add(q.id);
    }
  }

  const ordered = input.shuffleQuestions ? shuffle(chosen, random) : chosen;

  return ordered.map((q) => {
    const ids = q.choices.map((c) => c.id);
    const slot: AttemptSlot = {
      q: q.id,
      p: q.points,
      // ถูก/ผิด คง "ถูก" ไว้ก่อน "ผิด" เสมอ — สลับแล้วชวนสับสนโดยไม่ได้ช่วยกันลอก
      c:
        input.shuffleChoices && q.type !== QuestionType.TRUE_FALSE && q.type !== QuestionType.SHORT_TEXT
          ? shuffle(ids, random)
          : ids,
    };
    if (q.type === QuestionType.MATCHING) {
      // ฝั่งขวาสลับเสมอ ไม่งั้นลำดับเดียวกับฝั่งซ้ายคือเฉลย
      slot.r = shuffle([...new Set(q.choices.map((c) => c.matchKey ?? ""))].filter(Boolean), random);
    }
    if (q.type === QuestionType.SHORT_TEXT || q.type === QuestionType.ESSAY) {
      // ข้อเติมคำไม่ส่งรายการคำตอบที่ยอมรับไปกับ snapshot
      slot.c = [];
    }
    return slot;
  });
}

/** อ่าน snapshot จาก JSON ใน DB — ข้อมูลเสียถือว่าไม่มีข้อ */
export function parseSlots(value: unknown): AttemptSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const s = raw as Partial<AttemptSlot>;
    if (typeof s?.q !== "string" || typeof s.p !== "number" || !Array.isArray(s.c)) return [];
    return [{ q: s.q, p: s.p, c: s.c.filter((v) => typeof v === "string"), ...(Array.isArray(s.r) ? { r: s.r } : {}) }];
  });
}

/** อ่านกฎสุ่มจาก `Quiz.randomPool` */
export function parsePool(value: unknown): PoolRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const r = raw as Partial<PoolRule>;
    return typeof r?.tag === "string" && Number.isInteger(r.count) && r.count! > 0
      ? [{ tag: r.tag, count: r.count! }]
      : [];
  });
}

/* ─────────── เวลา (FR-07.5) ─────────── */

/**
 * เผื่อเวลาให้คำตอบที่กำลังส่งอยู่ตอนหมดเวลา (เน็ตช้า) ก่อนที่ server จะปิด attempt เอง
 * นับเฉพาะฝั่ง server — ตัวนับเวลาที่ผู้เรียนเห็นยังหมดตรงเวลา
 */
export const DEADLINE_GRACE_MS = 10_000;

type Window = { availableFrom: Date | null; availableUntil: Date | null };

export type QuizOpenState = "open" | "not-yet" | "closed";

export function quizOpenState(quiz: Window, now: Date): QuizOpenState {
  if (quiz.availableFrom && now < quiz.availableFrom) return "not-yet";
  if (quiz.availableUntil && now >= quiz.availableUntil) return "closed";
  return "open";
}

/** เวลาสิ้นสุดของ attempt = เร็วกว่าระหว่าง "เริ่ม + เวลาที่กำหนด" กับ "เวลาปิดแบบทดสอบ" */
export function attemptDeadline(
  startedAt: Date,
  timeLimitMin: number | null,
  availableUntil: Date | null,
): Date | null {
  const byLimit = timeLimitMin ? new Date(startedAt.getTime() + timeLimitMin * 60_000) : null;
  if (byLimit && availableUntil) return byLimit < availableUntil ? byLimit : availableUntil;
  return byLimit ?? availableUntil;
}

/** ยังรับคำตอบได้ไหม (รวมช่วงเผื่อ) */
export function acceptsAnswers(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || now.getTime() <= expiresAt.getTime() + DEADLINE_GRACE_MS;
}

/** เลยเวลาจนต้องปิด attempt ให้เองแล้วหรือยัง */
export function isOverdue(expiresAt: Date | null, now: Date): boolean {
  return !acceptsAnswers(expiresAt, now);
}

/* ─────────── เฉลย (FR-07.6) ─────────── */

export function canRevealAnswers(
  showAnswers: ShowAnswers,
  availableUntil: Date | null,
  now: Date,
): boolean {
  if (showAnswers === ShowAnswers.IMMEDIATELY) return true;
  if (showAnswers === ShowAnswers.AFTER_CLOSE) return availableUntil !== null && now >= availableUntil;
  return false;
}

export const SHOW_ANSWERS_LABEL: Record<ShowAnswers, string> = {
  [ShowAnswers.IMMEDIATELY]: "ทันทีหลังส่ง",
  [ShowAnswers.AFTER_CLOSE]: "หลังปิดแบบทดสอบ",
  [ShowAnswers.NEVER]: "ไม่แสดง",
};
