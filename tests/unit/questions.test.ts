import { describe, expect, it } from "vitest";
import { QuestionType } from "@/generated/prisma/enums";
import { parseCsv, toCsv } from "@/lib/csv";
import { readXlsxRows, toXlsx } from "@/lib/xlsx";
import { formatScore, toScore } from "@/lib/decimal";
import { plainTextToDoc } from "@/lib/rich-text-doc";
import { questionBodySchema, questionFilterSchema } from "@/features/questions/schemas";
import { parseQuestionTable, QUESTION_TEMPLATE_ROWS } from "@/features/questions/lib/import";

const choice = (text: string, isCorrect = false, matchKey: string | null = null) => ({
  text,
  isCorrect,
  matchKey,
});

function firstError(input: Record<string, unknown>) {
  const result = questionBodySchema.safeParse({ points: 1, tags: "", ...input });
  return result.success ? null : result.error.issues[0]!.message;
}

describe("questionBodySchema — เฉลยของแต่ละชนิด (FR-07.2)", () => {
  it("ปรนัยตอบเดียวต้องมีคำตอบที่ถูก 1 ตัวพอดี", () => {
    expect(firstError({ type: "SINGLE", choices: [choice("ก", true), choice("ข")] })).toBeNull();
    expect(firstError({ type: "SINGLE", choices: [choice("ก", true), choice("ข", true)] })).toBe(
      "ข้อปรนัยตอบเดียวต้องเลือกคำตอบที่ถูก 1 ตัว",
    );
    expect(firstError({ type: "SINGLE", choices: [choice("ก", true)] })).toBe("ต้องมีตัวเลือกอย่างน้อย 2 ตัว");
  });

  it("หลายคำตอบต้องถูกอย่างน้อย 1 ตัว และตัวเลือกห้ามซ้ำ", () => {
    expect(firstError({ type: "MULTIPLE", choices: [choice("ก", true), choice("ข", true)] })).toBeNull();
    expect(firstError({ type: "MULTIPLE", choices: [choice("ก"), choice("ข")] })).toBe(
      "ต้องเลือกคำตอบที่ถูกอย่างน้อย 1 ตัว",
    );
    expect(firstError({ type: "MULTIPLE", choices: [choice("ก", true), choice("ก")] })).toBe(
      "มีตัวเลือกที่ข้อความซ้ำกัน",
    );
  });

  it("ถูก/ผิดต้องเป็นตัวเลือกตายตัว “ถูก” “ผิด”", () => {
    expect(firstError({ type: "TRUE_FALSE", choices: [choice("ถูก"), choice("ผิด", true)] })).toBeNull();
    expect(firstError({ type: "TRUE_FALSE", choices: [choice("ใช่", true), choice("ไม่ใช่")] })).not.toBeNull();
  });

  it("จับคู่ต้องมีฝั่งขวาทุกคู่ และฝั่งซ้ายไม่ซ้ำ", () => {
    const ok = [choice("HTML", true, "โครงสร้าง"), choice("CSS", true, "รูปแบบ")];
    expect(firstError({ type: "MATCHING", choices: ok })).toBeNull();
    expect(firstError({ type: "MATCHING", choices: [choice("HTML", true, "โครงสร้าง"), choice("CSS", true)] })).toBe(
      "ทุกคู่ต้องมีคำตอบฝั่งขวา",
    );
  });

  it("เติมคำต้องมีคำตอบที่ยอมรับ · อัตนัยห้ามมีตัวเลือก", () => {
    expect(firstError({ type: "SHORT_TEXT", choices: [choice("CSS", true)] })).toBeNull();
    expect(firstError({ type: "SHORT_TEXT", choices: [] })).toBe("ต้องมีคำตอบที่ยอมรับอย่างน้อย 1 คำตอบ");
    expect(firstError({ type: "ESSAY", choices: [] })).toBeNull();
    expect(firstError({ type: "ESSAY", choices: [choice("x")] })).toBe("ข้ออัตนัยไม่มีตัวเลือก");
  });

  it("คะแนนและแท็ก", () => {
    expect(firstError({ type: "ESSAY", points: 0 })).toContain("ไม่น้อยกว่า");
    expect(firstError({ type: "ESSAY", points: 1.234 })).toBe("คะแนนมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง");
    const parsed = questionBodySchema.parse({ type: "ESSAY", points: "2.5", tags: " บทที่ 1, พื้นฐาน,บทที่ 1 " });
    expect(parsed.points).toBe(2.5);
    expect(parsed.tags).toEqual(["บทที่ 1", "พื้นฐาน"]);
  });
});

describe("questionFilterSchema", () => {
  it("ค่าใน URL ที่ผิดรูปไม่ทำให้หน้าพัง", () => {
    expect(questionFilterSchema.parse({ type: "NOPE", page: "-3", archived: "x" })).toMatchObject({
      q: "",
      type: undefined,
      archived: false,
      page: 1,
    });
    expect(questionFilterSchema.parse({ type: "ESSAY", archived: "1", page: "2" })).toMatchObject({
      type: "ESSAY",
      archived: true,
      page: 2,
    });
  });
});

describe("lib/csv", () => {
  it("รองรับคำพูด จุลภาค และการขึ้นบรรทัดใหม่ในเซลล์", () => {
    const rows = parseCsv('ชนิด,โจทย์\r\nESSAY,"บรรทัดแรก\nบรรทัดสอง, มีจุลภาค ""อ้างอิง"""\r\n\r\n');
    expect(rows).toEqual([
      ["ชนิด", "โจทย์"],
      ["ESSAY", 'บรรทัดแรก\nบรรทัดสอง, มีจุลภาค "อ้างอิง"'],
    ]);
  });

  it("toCsv ใส่ BOM ให้ Excel อ่านภาษาไทยได้ และอ่านกลับได้ค่าเดิม", () => {
    const csv = toCsv(QUESTION_TEMPLATE_ROWS);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv)).toEqual(QUESTION_TEMPLATE_ROWS.map((r) => r.map((c) => c)).filter((r) => r.some(Boolean)));
  });
});

describe("lib/xlsx", () => {
  it("เขียนแล้วอ่านกลับได้ตารางเดิม (FR-07.7)", async () => {
    const buffer = await toXlsx("ข้อสอบ", QUESTION_TEMPLATE_ROWS);
    const rows = await readXlsxRows(new Uint8Array(buffer).buffer);
    expect(rows[0]).toEqual(QUESTION_TEMPLATE_ROWS[0]);
    expect(rows[1]![1]).toBe(QUESTION_TEMPLATE_ROWS[1]![1]);
    expect(rows).toHaveLength(QUESTION_TEMPLATE_ROWS.length);
  });
});

describe("parseQuestionTable (FR-07.7)", () => {
  it("แม่แบบของระบบผ่านทุกแถวและครบ 6 ชนิด", () => {
    const result = parseQuestionTable(QUESTION_TEMPLATE_ROWS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.errorCount).toBe(0);
    expect(new Set(result.rows.map((r) => (r.ok ? r.question.type : null)))).toEqual(
      new Set(Object.values(QuestionType)),
    );
  });

  it("แปลงคำตอบแต่ละชนิดเป็นเฉลยถูกตัว", () => {
    const result = parseQuestionTable(QUESTION_TEMPLATE_ROWS);
    if (!result.ok) throw new Error("template invalid");
    const byType = Object.fromEntries(result.rows.map((r) => [r.ok ? r.question.type : "x", r]));

    const single = byType.SINGLE!;
    expect(single.ok && single.question.choices.map((c) => c.isCorrect)).toEqual([false, true, false]);
    const multiple = byType.MULTIPLE!;
    expect(multiple.ok && multiple.question.choices.filter((c) => c.isCorrect).map((c) => c.text)).toEqual([
      "Python",
      "Java",
    ]);
    const tf = byType.TRUE_FALSE!;
    expect(tf.ok && tf.question.choices).toEqual([
      { text: "ถูก", isCorrect: true, matchKey: null },
      { text: "ผิด", isCorrect: false, matchKey: null },
    ]);
    const matching = byType.MATCHING!;
    expect(matching.ok && matching.question.choices[0]).toMatchObject({ text: "HTML", matchKey: "โครงสร้างหน้าเว็บ" });
    const short = byType.SHORT_TEXT!;
    expect(short.ok && short.question.choices.map((c) => c.text)).toEqual(["CSS", "Cascading Style Sheets"]);
  });

  it("รับหัวคอลัมน์ภาษาอังกฤษและชื่อชนิดภาษาไทย", () => {
    const result = parseQuestionTable([
      ["type", "question", "options", "answer"],
      ["ปรนัย", "1+1 เท่ากับเท่าไร", "1|2|3", "2"],
      ["ถูกผิด", "ฟ้าเป็นสีน้ำเงิน", "", "false"],
    ]);
    expect(result.ok && result.errorCount).toBe(0);
  });

  it("รายงานแถวที่ผิดพร้อมเลขแถวแบบที่เห็นใน Excel", () => {
    const result = parseQuestionTable([
      ["ชนิด", "โจทย์", "ตัวเลือก", "คำตอบ"],
      ["SINGLE", "ข้อดี", "ก|ข", "1"],
      ["SINGLE", "เลือกเกินจำนวน", "ก|ข", "5"],
      ["ไม่รู้จัก", "x", "", ""],
      ["MATCHING", "คู่ไม่ครบ", "ก=1|ข", ""],
      ["ESSAY", "", "", ""],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validCount).toBe(1);
    const errors = result.rows.filter((r) => !r.ok);
    expect(errors.map((r) => r.line)).toEqual([3, 4, 5, 6]);
    expect(errors.map((r) => (r.ok ? "" : r.error))).toEqual([
      "คำตอบต้องเป็นลำดับตัวเลือก 1–2 เช่น 2",
      "ไม่รู้จักชนิดข้อสอบ “ไม่รู้จัก”",
      "ตัวเลือกของข้อจับคู่ต้องเขียนเป็น ซ้าย=ขวา คั่นแต่ละคู่ด้วย |",
      "โจทย์ว่าง",
    ]);
  });

  it("ไฟล์ที่ไม่มีหัวตารางหรือว่างถูกปฏิเสธทั้งไฟล์", () => {
    expect(parseQuestionTable([["a", "b"], ["1", "2"]]).ok).toBe(false);
    expect(parseQuestionTable([]).ok).toBe(false);
  });
});

describe("lib/decimal + plainTextToDoc", () => {
  it("แปลง Decimal/สตริงเป็นคะแนน 2 ตำแหน่ง", () => {
    expect(toScore({ toNumber: () => 1.005 })).toBe(1);
    expect(toScore("2.50")).toBe(2.5);
    expect(toScore(null)).toBeNull();
    expect(formatScore(null)).toBe("–");
  });

  it("ข้อความหลายบรรทัดกลายเป็นย่อหน้า · ข้อความว่างคืน null", () => {
    expect(plainTextToDoc("บรรทัด 1\nบรรทัด 2")?.content).toHaveLength(2);
    expect(plainTextToDoc("   ")).toBeNull();
  });
});
