import { describe, expect, it } from "vitest";
import {
  calcProgressPct,
  isLessonUnlocked,
  meetsCompletionRule,
  reachedVideoCompletion,
  resumeLessonId,
  unlockedLessonIds,
  type OutlineLesson,
} from "@/features/enrollment/lib/progress";
import { DEFAULT_COMPLETION_RULE } from "@/features/courses/schemas";

/** M06 · Phase 1 ขั้น 5 — สูตร % และกติกาเรียนตามลำดับคือหัวใจของโมดูลนี้ */

function lessons(...spec: [id: string, completed: boolean, isPreview?: boolean][]): OutlineLesson[] {
  return spec.map(([id, completed, isPreview]) => ({
    id,
    completed,
    isPreview: isPreview ?? false,
  }));
}

describe("calcProgressPct", () => {
  it("คอร์สที่ยังไม่มีบทเรียนคืน 0 ไม่ใช่ NaN", () => {
    expect(calcProgressPct(0, 0)).toBe(0);
    expect(calcProgressPct(3, 0)).toBe(0);
  });

  it("คำนวณสัดส่วนและปัดเป็นจำนวนเต็ม", () => {
    expect(calcProgressPct(0, 4)).toBe(0);
    expect(calcProgressPct(1, 4)).toBe(25);
    expect(calcProgressPct(1, 3)).toBe(33);
    expect(calcProgressPct(2, 3)).toBe(67);
  });

  it("จบครบทุกบทเท่านั้นจึงเป็น 100", () => {
    expect(calcProgressPct(4, 4)).toBe(100);
    // 199/200 ปัดขึ้นได้ 100 ทั้งที่ยังเหลือบทหนึ่ง — ต้องกันไว้ที่ 99
    expect(calcProgressPct(199, 200)).toBe(99);
  });

  it("ค่าที่เกินหรือติดลบถูกดึงกลับเข้าในช่วง", () => {
    expect(calcProgressPct(-2, 4)).toBe(0);
    expect(calcProgressPct(9, 4)).toBe(100);
  });
});

describe("reachedVideoCompletion", () => {
  it("ดูถึง 90% ของความยาวถือว่าจบ (FR-06.3)", () => {
    expect(reachedVideoCompletion(89, 100)).toBe(false);
    expect(reachedVideoCompletion(90, 100)).toBe(true);
    expect(reachedVideoCompletion(100, 100)).toBe(true);
  });

  it("วิดีโอที่ไม่รู้ความยาวยังไม่นับว่าจบ", () => {
    expect(reachedVideoCompletion(9999, null)).toBe(false);
    expect(reachedVideoCompletion(10, 0)).toBe(false);
  });
});

describe("isLessonUnlocked / unlockedLessonIds", () => {
  it("คอร์สที่ไม่บังคับลำดับเปิดได้ทุกบท", () => {
    const list = lessons(["a", false], ["b", false], ["c", false]);
    expect(unlockedLessonIds(list, false)).toEqual(new Set(["a", "b", "c"]));
  });

  it("คอร์สที่บังคับลำดับเปิดได้ถึงบทถัดจากบทที่จบล่าสุด", () => {
    const list = lessons(["a", true], ["b", false], ["c", false]);
    expect(isLessonUnlocked(list, 0, true)).toBe(true);
    expect(isLessonUnlocked(list, 1, true)).toBe(true);
    expect(isLessonUnlocked(list, 2, true)).toBe(false);
  });

  it("ต้องจบบทก่อนหน้าครบทุกบท ไม่ใช่แค่บทที่ติดกัน", () => {
    // เคยเรียนข้ามมาก่อนผู้สอนเปิดโหมดเรียนตามลำดับ: b จบแล้วแต่ a ยังค้าง
    const list = lessons(["a", false], ["b", true], ["c", false]);
    expect(isLessonUnlocked(list, 2, true)).toBe(false);
  });

  it("บทเรียนตัวอย่างเปิดได้เสมอ และไม่กั้นบทถัดไป", () => {
    const list = lessons(["a", false, true], ["b", false], ["c", false]);
    expect(isLessonUnlocked(list, 0, true)).toBe(true);
    expect(isLessonUnlocked(list, 1, true)).toBe(true);
    expect(isLessonUnlocked(list, 2, true)).toBe(false);
  });

  it("ดัชนีนอกช่วงถือว่าเข้าไม่ได้", () => {
    const list = lessons(["a", true]);
    expect(isLessonUnlocked(list, -1, false)).toBe(false);
    expect(isLessonUnlocked(list, 5, false)).toBe(false);
  });
});

describe("resumeLessonId (FR-06.4)", () => {
  it("คอร์สว่างไม่มีปลายทาง", () => {
    expect(resumeLessonId([], null, false)).toBeNull();
  });

  it("กลับไปบทล่าสุดที่ค้างไว้", () => {
    const list = lessons(["a", true], ["b", false], ["c", false]);
    expect(resumeLessonId(list, "b", true)).toBe("b");
  });

  it("บทล่าสุดที่ถูกลบไปแล้วตกไปใช้บทแรกที่ยังไม่จบ", () => {
    const list = lessons(["a", true], ["b", false]);
    expect(resumeLessonId(list, "ลบไปแล้ว", false)).toBe("b");
  });

  it("บทล่าสุดที่ยังถูกล็อกอยู่ไม่ถูกเลือก", () => {
    const list = lessons(["a", false], ["b", false], ["c", false]);
    expect(resumeLessonId(list, "c", true)).toBe("a");
  });

  it("เรียนจบหมดแล้วพากลับไปบทแรกเพื่อทบทวน", () => {
    const list = lessons(["a", true], ["b", true]);
    expect(resumeLessonId(list, null, true)).toBe("a");
  });
});

describe("meetsCompletionRule (FR-04.7)", () => {
  it("ต้องถึง minProgress ก่อน", () => {
    expect(meetsCompletionRule(99, DEFAULT_COMPLETION_RULE)).toBe(false);
    expect(meetsCompletionRule(100, DEFAULT_COMPLETION_RULE)).toBe(true);
    expect(meetsCompletionRule(80, { ...DEFAULT_COMPLETION_RULE, minProgress: 80 })).toBe(true);
  });

  it("Phase 1 ยังไม่มีผลแบบทดสอบส่งเข้ามา จึงตัดสินด้วย % อย่างเดียว", () => {
    const rule = { minProgress: 100, requireQuizPass: true, minScore: 60 };
    expect(meetsCompletionRule(100, rule)).toBe(true);
  });

  it("เมื่อ M07 ส่งผลแบบทดสอบเข้ามา เงื่อนไขแบบทดสอบจะมีผลทันที", () => {
    const rule = { minProgress: 100, requireQuizPass: true, minScore: 60 };
    expect(meetsCompletionRule(100, rule, { allPassed: false, totalScorePct: 90 })).toBe(false);
    expect(meetsCompletionRule(100, rule, { allPassed: true, totalScorePct: 50 })).toBe(false);
    expect(meetsCompletionRule(100, rule, { allPassed: true, totalScorePct: 60 })).toBe(true);
  });

  it("คอร์สที่ไม่กำหนดคะแนนขั้นต่ำไม่สนใจคะแนนรวม", () => {
    const rule = { minProgress: 50, requireQuizPass: false, minScore: null };
    expect(meetsCompletionRule(50, rule, { allPassed: false, totalScorePct: null })).toBe(true);
  });
});
