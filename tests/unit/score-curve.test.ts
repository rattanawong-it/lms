import { describe, expect, it } from "vitest";
import { bandFor, checkCurve, curveValue, parseStoredCurve, type CurveBand } from "@/features/gradebook/lib/curve";
import { weightedTotal } from "@/features/gradebook/lib/calc";
import { curveScopeSchema, scoreCurveSchema } from "@/features/score-curve/schemas";
import { canEditCurveScope } from "@/features/score-curve/lib/access";
import { Role } from "@/generated/prisma/enums";

/** เกณฑ์จริงของมหาวิทยาลัย (Q6 · CHANGELOG #29) — ค่าเดียวกับที่ migration `score_curve` ใส่ลง DB */
const GRADES: CurveBand[] = [
  { label: "A", min: 80, max: 100 },
  { label: "B+", min: 75, max: 79 },
  { label: "B", min: 70, max: 74 },
  { label: "C+", min: 65, max: 69 },
  { label: "C", min: 60, max: 64 },
  { label: "D+", min: 55, max: 59 },
  { label: "D", min: 50, max: 54 },
  { label: "F", min: 0, max: 49 },
];
const PASS_FAIL: CurveBand[] = [
  { label: "S", min: 50, max: 100 },
  { label: "U", min: 0, max: 49 },
];

describe("ตัดผลด้วยคะแนนที่ตัดทศนิยมทิ้ง (FR-09.9)", () => {
  it("เกณฑ์จริงผ่านการตรวจทั้งสองส่วน", () => {
    expect(checkCurve(GRADES)).toBeNull();
    expect(checkCurve(PASS_FAIL)).toBeNull();
  });

  it("79.50 แสดงตามจริงแต่ตัดด้วย 79 → B+", () => {
    expect(curveValue(79.5)).toBe(79);
    expect(bandFor(79.5, GRADES)).toBe("B+");
    expect(bandFor(79.99, GRADES)).toBe("B+");
    expect(bandFor(80, GRADES)).toBe("A");
    expect(bandFor(49.99, PASS_FAIL)).toBe("U");
    expect(bandFor(50, PASS_FAIL)).toBe("S");
  });

  it("ขอบทุกช่วงและค่าสุดขั้ว", () => {
    expect(bandFor(100, GRADES)).toBe("A");
    expect(bandFor(75, GRADES)).toBe("B+");
    expect(bandFor(74.99, GRADES)).toBe("B");
    expect(bandFor(54.5, GRADES)).toBe("D");
    expect(bandFor(0, GRADES)).toBe("F");
    expect(bandFor(null, GRADES)).toBeNull();
  });

  it("79.995 ปัด 2 ตำแหน่งเป็น 80.00 ก่อน → A", () => {
    const total = weightedTotal([{ id: "a", maxScore: 200, weight: 100 }], new Map([["a", 159.99]]));
    expect(total).toBe(80);
    expect(bandFor(total, GRADES)).toBe("A");
  });
});

describe("ตรวจเกณฑ์ก่อนบันทึก (FR-09.9)", () => {
  it("Min ต้องไม่มากกว่า Max", () => {
    expect(checkCurve([{ label: "S", min: 60, max: 50 }, PASS_FAIL[1]!])).toEqual({
      message: "S: Min ต้องไม่มากกว่า Max",
      rows: [0],
    });
  });

  it("ช่วงซ้อนทับ บอกคู่ที่ชนกัน", () => {
    const issue = checkCurve([
      { label: "S", min: 50, max: 100 },
      { label: "U", min: 0, max: 50 },
    ]);
    expect(issue?.message).toBe("ช่วงของ U (0–50) กับ S (50–100) ซ้อนทับกัน");
    expect(issue?.rows.sort()).toEqual([0, 1]);
  });

  it("ช่องว่างของจำนวนเต็ม", () => {
    expect(checkCurve([{ label: "S", min: 60, max: 100 }, { label: "U", min: 0, max: 49 }])?.message).toBe(
      "คะแนน 50–59 ไม่อยู่ในช่วงใดเลย",
    );
    expect(checkCurve([{ label: "S", min: 50, max: 99 }, { label: "U", min: 0, max: 49 }])?.message).toBe(
      "คะแนน 100 ไม่อยู่ในช่วงใดเลย",
    );
  });

  it("ช่วงทศนิยมที่จำนวนเต็มครบถือว่าถูก (Q11)", () => {
    expect(checkCurve([{ label: "S", min: 49.5, max: 100 }, { label: "U", min: 0, max: 49.49 }])).toBeNull();
  });

  it("0–100 · ทศนิยม ≤ 2 · ชื่อไม่ว่าง/ไม่ซ้ำ · อย่างน้อย 2 ระดับ", () => {
    expect(checkCurve([{ label: "S", min: 50, max: 101 }, PASS_FAIL[1]!])?.message).toBe("S: Max ต้องอยู่ระหว่าง 0–100");
    expect(checkCurve([{ label: "S", min: 50.005, max: 100 }, PASS_FAIL[1]!])?.message).toBe(
      "S: Min ละเอียดได้ไม่เกิน 2 ตำแหน่ง",
    );
    expect(checkCurve([{ label: " ", min: 50, max: 100 }, PASS_FAIL[1]!])?.message).toBe("แถวที่ 1: กรุณาใส่ชื่อ");
    expect(checkCurve([{ label: "s", min: 50, max: 100 }, { label: "S", min: 0, max: 49 }])?.message).toBe(
      "ชื่อ “S” ซ้ำกัน",
    );
    expect(checkCurve([{ label: "A", min: 0, max: 100 }])?.message).toBe("ต้องมีอย่างน้อย 2 ระดับ");
    expect(checkCurve([{ label: "S", min: Number.NaN, max: 100 }, PASS_FAIL[1]!])?.message).toBe("S: Min ต้องเป็นตัวเลข");
  });
});

describe("อ่านเกณฑ์จาก DB", () => {
  it("รูปแบบใหม่ — เรียงจากสูงไปต่ำ · ส่วนที่เสียคืนว่าง (ไปใช้ชั้นบน)", () => {
    expect(parseStoredCurve({ grades: [...GRADES].reverse(), passFail: PASS_FAIL })).toEqual({
      grades: GRADES,
      passFail: PASS_FAIL,
    });
    expect(parseStoredCurve({ grades: GRADES, passFail: [{ label: "S", min: 0, max: 100 }] })).toEqual({ grades: GRADES });
    expect(parseStoredCurve(null)).toEqual({});
  });

  it("รูปแบบเก่าของ Course.gradeScale [{grade,min}] ยังใช้ได้", () => {
    expect(parseStoredCurve([{ grade: "S", min: 60 }, { grade: "U", min: 0 }])).toEqual({
      grades: [
        { label: "S", min: 60, max: 100 },
        { label: "U", min: 0, max: 59.99 },
      ],
    });
    expect(parseStoredCurve([{ grade: "ผ่าน", min: 50 }])).toEqual({});
  });
});

describe("schema Score Curve (ข้อความไทย)", () => {
  it("แปลงตัวเลขจากฟอร์มและเรียงให้", () => {
    const parsed = scoreCurveSchema.parse({
      grades: [
        { label: "F", min: "0", max: "49" },
        { label: "P", min: "50", max: "100" },
      ],
      passFail: PASS_FAIL,
    });
    expect(parsed.grades.map((b) => b.label)).toEqual(["P", "F"]);
  });

  it("บอกปัญหาเป็นภาษาไทย", () => {
    const result = scoreCurveSchema.safeParse({ grades: GRADES, passFail: [{ label: "S", min: 60, max: 100 }, PASS_FAIL[1]!] });
    expect(result.error?.issues[0]?.path).toEqual(["passFail"]);
    expect(result.error?.issues[0]?.message).toBe("คะแนน 50–59 ไม่อยู่ในช่วงใดเลย");
    expect(scoreCurveSchema.safeParse({ grades: [{ label: "A", min: "x", max: 100 }], passFail: PASS_FAIL }).error?.issues[0]?.message).toBe(
      "Min ต้องเป็นตัวเลข",
    );
  });

  it("ขอบเขตรับเฉพาะ system หรือ id คณะ", () => {
    expect(curveScopeSchema.safeParse("system").success).toBe(true);
    expect(curveScopeSchema.safeParse("ckv0000000000000000000000").success).toBe(true);
    expect(curveScopeSchema.safeParse("x").success).toBe(false);
  });
});

describe("สิทธิ์แก้เกณฑ์กลาง (FR-09.7 · Q10)", () => {
  const dept = "ckv0000000000000000000001";
  const other = "ckv0000000000000000000002";

  it("SUPER_ADMIN แก้ได้ทั้งระบบและทุกคณะ", () => {
    const user = { role: Role.SUPER_ADMIN, departmentId: null };
    expect(canEditCurveScope(user, "system")).toBe(true);
    expect(canEditCurveScope(user, dept)).toBe(true);
  });

  it("DEPT_ADMIN แก้ได้เฉพาะคณะตัวเอง ไม่ใช่ทั้งระบบ", () => {
    const user = { role: Role.DEPT_ADMIN, departmentId: dept };
    expect(canEditCurveScope(user, dept)).toBe(true);
    expect(canEditCurveScope(user, other)).toBe(false);
    expect(canEditCurveScope(user, "system")).toBe(false);
    expect(canEditCurveScope({ role: Role.DEPT_ADMIN, departmentId: null }, "system")).toBe(false);
  });

  it("ผู้สอน/ผู้เรียนแก้เกณฑ์กลางไม่ได้", () => {
    expect(canEditCurveScope({ role: Role.INSTRUCTOR, departmentId: dept }, dept)).toBe(false);
    expect(canEditCurveScope({ role: Role.STUDENT, departmentId: dept }, dept)).toBe(false);
  });
});
