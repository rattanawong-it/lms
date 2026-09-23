import { QuestionType } from "@/generated/prisma/enums";
import { plainTextToDoc, type RichTextDoc } from "@/lib/rich-text-doc";
import {
  IMPORT_MAX_ROWS,
  questionBodySchema,
  TRUE_FALSE_CHOICES,
  type QuestionBody,
} from "@/features/questions/schemas";

/**
 * M07 · FR-07.7 — แปลงตาราง (จาก CSV หรือ Excel) เป็นข้อสอบที่ผ่านการตรวจแล้ว
 *
 * ทั้งสองรูปแบบถูกอ่านเป็น `string[][]` ก่อน (`lib/csv.ts`, `lib/xlsx.ts`)
 * ตัวตรวจจึงมีชุดเดียว และผลตรวจของไฟล์ทั้งสองแบบตรงกันเสมอ
 *
 * รูปแบบคอลัมน์ (ดูตัวอย่างใน `QUESTION_TEMPLATE_ROWS`):
 *   ชนิด         SINGLE | MULTIPLE | TRUE_FALSE | MATCHING | SHORT_TEXT | ESSAY (หรือชื่อภาษาไทย)
 *   โจทย์        ข้อความ (ขึ้นบรรทัดใหม่ได้)
 *   ตัวเลือก      คั่นด้วย | · ข้อจับคู่เขียนเป็น ซ้าย=ขวา|ซ้าย=ขวา
 *   คำตอบ        ลำดับตัวเลือกที่ถูก เช่น 2 หรือ 1,3 · ถูก/ผิด · ข้อเติมคำใส่คำตอบที่ยอมรับคั่นด้วย |
 *   คะแนน        ไม่ใส่ = 1
 *   แท็ก         คั่นด้วย , หรือ |
 *   คำอธิบายเฉลย ไม่บังคับ
 */

export type ImportedQuestion = QuestionBody & {
  prompt: RichTextDoc;
  explanation: RichTextDoc | null;
};

export type ImportRow =
  | { line: number; ok: true; question: ImportedQuestion; preview: string }
  | { line: number; ok: false; error: string; preview: string };

type Field = "type" | "prompt" | "choices" | "answer" | "points" | "tags" | "explanation";

/** หัวคอลัมน์ที่ยอมรับ (เทียบแบบตัวพิมพ์เล็ก ตัดช่องว่าง/ขีดล่าง) */
const HEADER_ALIASES: Record<string, Field> = {
  type: "type",
  "ชนิด": "type",
  "ประเภท": "type",
  prompt: "prompt",
  question: "prompt",
  "โจทย์": "prompt",
  "คำถาม": "prompt",
  choices: "choices",
  options: "choices",
  "ตัวเลือก": "choices",
  answer: "answer",
  answers: "answer",
  correct: "answer",
  "คำตอบ": "answer",
  "เฉลย": "answer",
  points: "points",
  score: "points",
  "คะแนน": "points",
  tags: "tags",
  tag: "tags",
  "แท็ก": "tags",
  explanation: "explanation",
  "คำอธิบาย": "explanation",
  "คำอธิบายเฉลย": "explanation",
};

/** ชื่อชนิดที่ยอมรับ — รหัสภาษาอังกฤษหรือคำไทยที่ผู้สอนน่าจะพิมพ์ */
const TYPE_ALIASES: Record<string, QuestionType> = {
  single: QuestionType.SINGLE,
  "ปรนัย": QuestionType.SINGLE,
  "ตอบเดียว": QuestionType.SINGLE,
  "ปรนัยตอบเดียว": QuestionType.SINGLE,
  multiple: QuestionType.MULTIPLE,
  "หลายคำตอบ": QuestionType.MULTIPLE,
  true_false: QuestionType.TRUE_FALSE,
  truefalse: QuestionType.TRUE_FALSE,
  "ถูกผิด": QuestionType.TRUE_FALSE,
  "ถูก/ผิด": QuestionType.TRUE_FALSE,
  matching: QuestionType.MATCHING,
  "จับคู่": QuestionType.MATCHING,
  short_text: QuestionType.SHORT_TEXT,
  shorttext: QuestionType.SHORT_TEXT,
  "เติมคำ": QuestionType.SHORT_TEXT,
  "เติมคำสั้น": QuestionType.SHORT_TEXT,
  essay: QuestionType.ESSAY,
  "อัตนัย": QuestionType.ESSAY,
};

const TRUE_WORDS = new Set(["ถูก", "true", "t", "จริง", "1", "yes"]);
const FALSE_WORDS = new Set(["ผิด", "false", "f", "เท็จ", "0", "no"]);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function splitList(value: string, pattern: RegExp): string[] {
  return value
    .split(pattern)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** "2" หรือ "1,3" → ลำดับตัวเลือก (เริ่มที่ 0) · คืน null เมื่อรูปแบบไม่ถูก */
function parseIndexes(answer: string, count: number): number[] | null {
  const parts = splitList(answer, /[,\s|]+/);
  if (parts.length === 0) return null;
  const indexes = parts.map((p) => Number(p) - 1);
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) return null;
  return [...new Set(indexes)];
}

type Parsed = { ok: true; question: ImportedQuestion } | { ok: false; error: string };

function parseRow(values: Partial<Record<Field, string>>): Parsed {
  const typeRaw = values.type?.trim() ?? "";
  const type =
    TYPE_ALIASES[normalizeKey(typeRaw)] ?? TYPE_ALIASES[typeRaw] ?? TYPE_ALIASES[typeRaw.toLowerCase()];
  if (!type) return { ok: false, error: `ไม่รู้จักชนิดข้อสอบ “${typeRaw || "(ว่าง)"}”` };

  const prompt = plainTextToDoc(values.prompt ?? "");
  if (!prompt) return { ok: false, error: "โจทย์ว่าง" };

  const options = splitList(values.choices ?? "", /\|/);
  const answer = values.answer?.trim() ?? "";
  let choices: { text: string; isCorrect: boolean; matchKey?: string | null }[] = [];

  switch (type) {
    case QuestionType.SINGLE:
    case QuestionType.MULTIPLE: {
      const correct = parseIndexes(answer, options.length);
      if (!correct) {
        return {
          ok: false,
          error: `คำตอบต้องเป็นลำดับตัวเลือก 1–${options.length} เช่น ${type === QuestionType.SINGLE ? "2" : "1,3"}`,
        };
      }
      choices = options.map((text, i) => ({ text, isCorrect: correct.includes(i) }));
      break;
    }
    case QuestionType.TRUE_FALSE: {
      const word = answer.toLowerCase();
      if (!TRUE_WORDS.has(word) && !FALSE_WORDS.has(word)) {
        return { ok: false, error: "คำตอบของข้อถูก/ผิดต้องเป็น “ถูก” หรือ “ผิด”" };
      }
      const isTrue = TRUE_WORDS.has(word);
      choices = TRUE_FALSE_CHOICES.map((text, i) => ({ text, isCorrect: isTrue === (i === 0) }));
      break;
    }
    case QuestionType.MATCHING: {
      const pairs = options.map((pair) => {
        const at = pair.indexOf("=");
        return at < 0 ? null : { text: pair.slice(0, at).trim(), matchKey: pair.slice(at + 1).trim() };
      });
      if (pairs.some((p) => !p || !p.text || !p.matchKey)) {
        return { ok: false, error: "ตัวเลือกของข้อจับคู่ต้องเขียนเป็น ซ้าย=ขวา คั่นแต่ละคู่ด้วย |" };
      }
      choices = pairs.map((p) => ({ ...p!, isCorrect: true }));
      break;
    }
    case QuestionType.SHORT_TEXT: {
      // รับคำตอบได้ทั้งจากคอลัมน์ "คำตอบ" และ "ตัวเลือก" — ผู้สอนมักใส่ไว้ช่องใดช่องหนึ่ง
      const accepted = splitList(answer || values.choices || "", /\|/);
      choices = accepted.map((text) => ({ text, isCorrect: true }));
      break;
    }
    case QuestionType.ESSAY:
      if (options.length > 0) return { ok: false, error: "ข้ออัตนัยต้องไม่มีตัวเลือก" };
      break;
  }

  const body = questionBodySchema.safeParse({
    type,
    points: values.points?.trim() || 1,
    tags: values.tags ?? "",
    choices,
  });
  if (!body.success) return { ok: false, error: body.error.issues[0]!.message };

  return {
    ok: true,
    question: {
      ...body.data,
      prompt,
      explanation: values.explanation ? plainTextToDoc(values.explanation) : null,
    },
  };
}

export type ImportResult =
  | { ok: false; error: string; rows: [] }
  | { ok: true; rows: ImportRow[]; validCount: number; errorCount: number };

/** แถวแรกเป็นหัวตารางเสมอ · คืนผลรายแถวเพื่อแสดงตัวอย่างก่อนยืนยัน */
export function parseQuestionTable(table: string[][]): ImportResult {
  if (table.length < 2) {
    return { ok: false, error: "ไม่พบข้อมูลในไฟล์ — แถวแรกต้องเป็นหัวตาราง และมีข้อสอบอย่างน้อย 1 แถว", rows: [] };
  }
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return { ok: false, error: `นำเข้าได้ครั้งละไม่เกิน ${IMPORT_MAX_ROWS} ข้อ`, rows: [] };
  }

  const headers = table[0]!.map((h) => HEADER_ALIASES[normalizeKey(h)] ?? HEADER_ALIASES[h.trim()] ?? null);
  if (!headers.includes("type") || !headers.includes("prompt")) {
    return { ok: false, error: "ไม่พบคอลัมน์ “ชนิด” และ “โจทย์” ในแถวแรก — ใช้ไฟล์แม่แบบของระบบ", rows: [] };
  }

  const rows: ImportRow[] = table.slice(1).map((cells, index) => {
    const values: Partial<Record<Field, string>> = {};
    headers.forEach((field, col) => {
      if (field && cells[col] !== undefined && cells[col] !== "") values[field] = cells[col];
    });
    const preview = (values.prompt ?? "").replace(/\s+/g, " ").slice(0, 80);
    const parsed = parseRow(values);
    // +2: นับหัวตารางและเริ่มที่ 1 ให้ตรงกับเลขแถวที่ผู้ใช้เห็นใน Excel
    return parsed.ok
      ? { line: index + 2, ok: true, question: parsed.question, preview }
      : { line: index + 2, ok: false, error: parsed.error, preview };
  });

  const validCount = rows.filter((r) => r.ok).length;
  return { ok: true, rows, validCount, errorCount: rows.length - validCount };
}

/** แม่แบบที่ให้ดาวน์โหลด — ใช้ทั้งไฟล์ CSV และ Excel และเป็นข้อมูลของ unit test ด้วย */
export const QUESTION_TEMPLATE_ROWS: string[][] = [
  ["ชนิด", "โจทย์", "ตัวเลือก", "คำตอบ", "คะแนน", "แท็ก", "คำอธิบายเฉลย"],
  ["SINGLE", "เมืองหลวงของประเทศไทยคือเมืองใด", "เชียงใหม่|กรุงเทพมหานคร|ขอนแก่น", "2", "1", "บทที่ 1", "กรุงเทพมหานครเป็นเมืองหลวง"],
  ["MULTIPLE", "ข้อใดเป็นภาษาโปรแกรม (เลือกได้หลายข้อ)", "Python|HTML|Java|CSS", "1,3", "2", "บทที่ 2", ""],
  ["TRUE_FALSE", "HTTP ย่อมาจาก HyperText Transfer Protocol", "", "ถูก", "1", "บทที่ 2", ""],
  ["MATCHING", "จับคู่ภาษากับการใช้งาน", "HTML=โครงสร้างหน้าเว็บ|CSS=การจัดรูปแบบ|JavaScript=การโต้ตอบ", "", "3", "บทที่ 2", ""],
  ["SHORT_TEXT", "ภาษาที่ใช้จัดรูปแบบหน้าเว็บย่อว่าอะไร", "", "CSS|Cascading Style Sheets", "1", "บทที่ 2", ""],
  ["ESSAY", "อธิบายความแตกต่างระหว่าง HTTP และ HTTPS", "", "", "5", "บทที่ 3", "ควรกล่าวถึงการเข้ารหัสและใบรับรอง"],
];
