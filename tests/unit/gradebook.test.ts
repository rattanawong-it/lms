import { describe, expect, it } from "vitest";
import { weightedTotal, weightSum } from "@/features/gradebook/lib/calc";
import { cellScoreSchema, manualItemSchema, weightsSchema } from "@/features/gradebook/schemas";
import { meetsCompletionRule } from "@/features/enrollment/lib/progress";

const scores = (entries: Record<string, number | null>) => new Map(Object.entries(entries));

describe("คะแนนรวมถ่วงน้ำหนัก (FR-09.2)", () => {
  const items = [
    { id: "quiz", maxScore: 100, weight: 30 },
    { id: "work", maxScore: 20, weight: 50 },
    { id: "attend", maxScore: 10, weight: 20 },
  ];

  it("รวม = Σ คะแนน/เต็ม × น้ำหนัก", () => {
    // 80/100×30 + 15/20×50 + 9/10×20 = 24 + 37.5 + 18
    expect(weightedTotal(items, scores({ quiz: 80, work: 15, attend: 9 }))).toBe(79.5);
  });

  it("ช่องที่ยังไม่มีคะแนนนับเป็น 0", () => {
    expect(weightedTotal(items, scores({ quiz: 80, work: null }))).toBe(24);
  });

  it("น้ำหนักรวมไม่เท่ากับ 100 → ยังคำนวณไม่ได้ (null)", () => {
    expect(weightedTotal([{ id: "a", maxScore: 10, weight: 60 }], scores({ a: 10 }))).toBeNull();
    expect(weightedTotal([], scores({}))).toBeNull();
  });

  it("น้ำหนักทศนิยมไม่เพี้ยนแบบ float (33.33 + 33.33 + 33.34 = 100)", () => {
    expect(weightSum([33.33, 33.33, 33.34])).toBe(100);
    expect(weightSum([0.1, 0.2, 99.7])).toBe(100);
    const thirds = [
      { id: "a", maxScore: 3, weight: 33.33 },
      { id: "b", maxScore: 3, weight: 33.33 },
      { id: "c", maxScore: 3, weight: 33.34 },
    ];
    expect(weightedTotal(thirds, scores({ a: 3, b: 3, c: 3 }))).toBe(100);
  });

  it("ปัดครั้งเดียวที่ 2 ตำแหน่ง (ครึ่งขึ้น) — ไม่ปัดระหว่างทาง", () => {
    // 1/3 × 100 = 33.333… → 33.33
    expect(weightedTotal([{ id: "a", maxScore: 3, weight: 100 }], scores({ a: 1 }))).toBe(33.33);
    // 2/3 × 100 = 66.666… → 66.67
    expect(weightedTotal([{ id: "a", maxScore: 3, weight: 100 }], scores({ a: 2 }))).toBe(66.67);
    // สองรายการที่ถ้าปัดแยกกันจะได้ 33.33 + 33.33 = 66.66 แต่รวมตรงตัวได้ 66.67
    const halves = [
      { id: "a", maxScore: 3, weight: 50 },
      { id: "b", maxScore: 3, weight: 50 },
    ];
    expect(weightedTotal(halves, scores({ a: 2, b: 2 }))).toBe(66.67);
  });

  it("กรณีขอบ 79.995 → ปัดเป็น 80.00 (ตัวเลขที่แสดง = ตัวเลขที่นำไปตัดผล — ตัดผลดู score-curve.test.ts)", () => {
    expect(weightedTotal([{ id: "a", maxScore: 200, weight: 100 }], scores({ a: 159.99 }))).toBe(80);
    expect(weightedTotal([{ id: "a", maxScore: 200, weight: 100 }], scores({ a: 159.98 }))).toBe(79.99);
  });
});

describe("schema สมุดคะแนน (ข้อความไทย)", () => {
  it("น้ำหนัก 0–100 ทศนิยมไม่เกิน 2 ตำแหน่ง", () => {
    const id = "ckv0000000000000000000000";
    expect(weightsSchema.parse([{ id, weight: "12.5" }])).toEqual([{ id, weight: 12.5 }]);
    expect(weightsSchema.safeParse([{ id, weight: "101" }]).error?.issues[0]?.message).toBe("น้ำหนักไม่เกิน 100%");
    expect(weightsSchema.safeParse([{ id, weight: "1.234" }]).error?.issues[0]?.message).toBe(
      "น้ำหนักละเอียดได้ไม่เกิน 2 ตำแหน่ง",
    );
  });

  it("ช่องคะแนน: ว่าง = ลบคะแนน", () => {
    expect(cellScoreSchema.parse("")).toBeNull();
    expect(cellScoreSchema.parse(" 8.5 ")).toBe(8.5);
    expect(cellScoreSchema.safeParse("-1").error?.issues[0]?.message).toBe("คะแนนต้องเป็นตัวเลขที่ไม่ติดลบ");
    expect(cellScoreSchema.safeParse("abc").success).toBe(false);
  });

  it("รายการกรอกเอง", () => {
    expect(manualItemSchema.parse({ title: " เข้าเรียน ", maxScore: "10" })).toEqual({ title: "เข้าเรียน", maxScore: 10 });
    expect(manualItemSchema.safeParse({ title: "", maxScore: "0" }).error?.issues.map((i) => i.message)).toEqual([
      "กรุณาตั้งชื่อรายการ",
      "คะแนนเต็มต้องมากกว่า 0",
    ]);
  });
});

describe("เงื่อนไขจบคอร์สที่อิงคะแนนรวม (Q4)", () => {
  const rule = { minProgress: 100, requireQuizPass: false, minScore: 60 };

  it("คะแนนรวมถึงขั้นต่ำ → จบ · ไม่ถึง/ยังคำนวณไม่ได้ → ยังไม่จบ", () => {
    expect(meetsCompletionRule(100, rule, { allPassed: true, totalScorePct: 60 })).toBe(true);
    expect(meetsCompletionRule(100, rule, { allPassed: true, totalScorePct: 59.99 })).toBe(false);
    expect(meetsCompletionRule(100, rule, { allPassed: true, totalScorePct: null })).toBe(false);
  });
});
