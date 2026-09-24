/**
 * M09 · FR-09.6–09.9 — Score Curve (pure function — client/server/unit test ใช้ได้)
 *
 * เกณฑ์มี 2 ส่วน: เกรด (A–F) และผ่าน/ไม่ผ่าน (S/U) · แต่ละแถวมีช่วง [min, max] ปิดทั้งสองข้าง
 * **ตัดผลด้วยคะแนนรวมที่ตัดทศนิยมทิ้ง** (79.50 → 79 → B+ เมื่อ B+ = 75–79) — ตัวเลขที่แสดงยังเป็น 79.50 (CHANGELOG #29)
 * ค่าเกณฑ์อยู่ใน DB (`ScoreCurve`, `Course.gradeScale`) ไฟล์นี้ไม่มีค่าเกณฑ์ตั้งต้น
 */

export type CurveBand = { label: string; min: number; max: number };
export type ScoreCurveData = { grades: CurveBand[]; passFail: CurveBand[] };
export type CurveSection = keyof ScoreCurveData;

export const CURVE_SECTION_LABEL: Record<CurveSection, string> = {
  grades: "เกรด",
  passFail: "ผ่าน/ไม่ผ่าน",
};

export const MAX_CURVE_BANDS = 15;

/** ค่าที่ใช้ตัดผล — ตัดทศนิยมทิ้ง (ค่าเผื่อกัน float เช่น 79.99999999 ที่ควรเป็น 80) */
export function curveValue(total: number): number {
  return Math.floor(total + 1e-9);
}

/** ผลของคะแนนรวมตามเกณฑ์ — null เมื่อยังไม่มีคะแนนรวม หรือไม่มีช่วงที่ครอบคลุม (เกณฑ์ที่ผ่านการตรวจแล้วจะไม่เกิด) */
export function bandFor(total: number | null, bands: readonly CurveBand[]): string | null {
  if (total === null) return null;
  const value = curveValue(total);
  return bands.find((b) => value >= b.min && value <= b.max)?.label ?? null;
}

/** เรียงจากช่วงสูงไปต่ำ — ลำดับที่แสดงและบันทึก */
export function sortBands<T extends CurveBand>(bands: readonly T[]): T[] {
  return [...bands].sort((a, b) => b.max - a.max || b.min - a.min);
}

export type CurveIssue = { message: string; rows: number[] };

function twoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

/**
 * FR-09.9 — ตรวจเกณฑ์หนึ่งส่วน คืนปัญหาแรกที่พบพร้อมแถวที่เกี่ยวข้อง (index ตามลำดับที่ส่งมา) หรือ null
 *   ชื่อไม่ว่าง/ไม่ซ้ำ · 0–100 · ทศนิยม ≤ 2 · min ≤ max · ไม่ซ้อนทับ · จำนวนเต็ม 0–100 ทุกค่าอยู่ในช่วงใดช่วงหนึ่ง
 */
export function checkCurve(bands: readonly CurveBand[]): CurveIssue | null {
  if (bands.length < 2) return { message: "ต้องมีอย่างน้อย 2 ระดับ", rows: [] };
  if (bands.length > MAX_CURVE_BANDS) return { message: `มีได้ไม่เกิน ${MAX_CURVE_BANDS} ระดับ`, rows: [] };

  for (const [i, b] of bands.entries()) {
    const name = b.label.trim() || `แถวที่ ${i + 1}`;
    if (!b.label.trim()) return { message: `แถวที่ ${i + 1}: กรุณาใส่ชื่อ`, rows: [i] };
    for (const [key, value] of [
      ["Min", b.min],
      ["Max", b.max],
    ] as const) {
      if (!Number.isFinite(value)) return { message: `${name}: ${key} ต้องเป็นตัวเลข`, rows: [i] };
      if (value < 0 || value > 100) return { message: `${name}: ${key} ต้องอยู่ระหว่าง 0–100`, rows: [i] };
      if (!twoDecimals(value)) return { message: `${name}: ${key} ละเอียดได้ไม่เกิน 2 ตำแหน่ง`, rows: [i] };
    }
    if (b.min > b.max) return { message: `${name}: Min ต้องไม่มากกว่า Max`, rows: [i] };
  }

  const seen = new Map<string, number>();
  for (const [i, b] of bands.entries()) {
    const key = b.label.trim().toUpperCase();
    const first = seen.get(key);
    if (first !== undefined) return { message: `ชื่อ “${b.label.trim()}” ซ้ำกัน`, rows: [first, i] };
    seen.set(key, i);
  }

  // เรียงตาม min แล้วเทียบคู่ติดกัน — ช่วงปิดทั้งสองข้าง จึงชนกันเมื่อ max ของตัวล่าง ≥ min ของตัวบน
  const order = bands.map((b, i) => ({ b, i })).sort((x, y) => x.b.min - y.b.min);
  for (let k = 1; k < order.length; k += 1) {
    const low = order[k - 1]!;
    const high = order[k]!;
    if (low.b.max >= high.b.min) {
      return {
        message: `ช่วงของ ${low.b.label.trim()} (${low.b.min}–${low.b.max}) กับ ${high.b.label.trim()} (${high.b.min}–${high.b.max}) ซ้อนทับกัน`,
        rows: [low.i, high.i],
      };
    }
  }

  // ตัดผลด้วยจำนวนเต็ม — จำนวนเต็ม 0–100 ทุกค่าต้องได้ผล
  for (let n = 0; n <= 100; n += 1) {
    if (bands.some((b) => n >= b.min && n <= b.max)) continue;
    let end = n;
    while (end < 100 && !bands.some((b) => end + 1 >= b.min && end + 1 <= b.max)) end += 1;
    return { message: `คะแนน ${n === end ? n : `${n}–${end}`} ไม่อยู่ในช่วงใดเลย`, rows: [] };
  }
  return null;
}

function readBands(value: unknown): CurveBand[] | null {
  if (!Array.isArray(value)) return null;
  const bands: CurveBand[] = [];
  for (const raw of value) {
    const b = raw as Partial<CurveBand> | null;
    if (typeof b?.label !== "string" || typeof b.min !== "number" || typeof b.max !== "number") return null;
    bands.push({ label: b.label, min: b.min, max: b.max });
  }
  return checkCurve(bands) ? null : sortBands(bands);
}

/**
 * อ่านเกณฑ์ที่เก็บใน DB — ส่วนที่ไม่มี/เสีย คืน null ให้ผู้เรียกไปใช้ชั้นบน (คอร์ส → คณะ → ระบบ)
 * รองรับรูปแบบเก่าของ `Course.gradeScale` (Phase 2 ขั้น 5): `[{grade,min}]` เรียงจากสูงไปต่ำ
 * → max = min ของแถวบน − 0.01 (แถวบนสุด 100) ให้ความหมายเดิม "ตั้งแต่ min ขึ้นไป" คงอยู่
 */
export function parseStoredCurve(value: unknown): Partial<ScoreCurveData> {
  if (Array.isArray(value)) {
    const legacy = value as { grade?: unknown; min?: unknown }[];
    if (!legacy.every((b) => typeof b?.grade === "string" && typeof b.min === "number")) return {};
    const sorted = [...legacy].sort((a, b) => (b.min as number) - (a.min as number));
    const grades = readBands(
      sorted.map((b, i) => ({
        label: b.grade as string,
        min: b.min as number,
        max: i === 0 ? 100 : Math.round(((sorted[i - 1]!.min as number) - 0.01) * 100) / 100,
      })),
    );
    return grades ? { grades } : {};
  }
  if (!value || typeof value !== "object") return {};
  const v = value as { grades?: unknown; passFail?: unknown };
  const out: Partial<ScoreCurveData> = {};
  const grades = readBands(v.grades);
  const passFail = readBands(v.passFail);
  if (grades) out.grades = grades;
  if (passFail) out.passFail = passFail;
  return out;
}
