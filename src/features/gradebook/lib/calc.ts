/**
 * M09 · FR-09.2 — คะแนนรวมถ่วงน้ำหนักและการตัดเกรด (pure function — client/server/unit test ใช้ได้)
 *
 * คะแนนทุกคอลัมน์เป็น Decimal 2 ตำแหน่ง จึงแปลงเป็นจำนวนเต็มหน่วย 1/100 แล้วรวมเป็นเศษส่วนด้วย BigInt
 * ไม่มีการปัดระหว่างทาง — ปัดครั้งเดียวที่ 2 ตำแหน่ง (ปัดครึ่งขึ้น) แล้วตัดเกรดจากค่าที่ปัดแล้ว
 * ตัวเลขที่ผู้สอน/ผู้เรียนเห็นจึงตรงกับที่ใช้ตัดเกรดเสมอ (phase-2-plan §7 ความเสี่ยงเรื่องปัดเศษ)
 */

export type GradeBand = { grade: string; min: number };

/**
 * เกณฑ์ตั้งต้นชั่วคราว (phase-2-plan Q6) — **จุดเดียว** ที่ต้องแก้เมื่อได้เกณฑ์จริงของมหาวิทยาลัย
 * ผู้สอนตั้งเกณฑ์ของคอร์สตัวเองทับได้ (`Course.gradeScale`)
 */
export const DEFAULT_GRADE_SCALE: readonly GradeBand[] = [
  { grade: "A", min: 80 },
  { grade: "B+", min: 75 },
  { grade: "B", min: 70 },
  { grade: "C+", min: 65 },
  { grade: "C", min: 60 },
  { grade: "D+", min: 55 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

// tsconfig target ต่ำกว่า ES2020 จึงเขียน literal แบบ 0n ไม่ได้
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** ตัวเลข 2 ตำแหน่ง → จำนวนเต็มหน่วย 1/100 (ค่าจาก DB เป็น Decimal(…,2) อยู่แล้ว การปัดตรงนี้แค่กัน float เพี้ยน) */
function hundredths(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

/** ผลรวมน้ำหนัก (%) แบบไม่เพี้ยน */
export function weightSum(weights: readonly number[]): number {
  return Number(weights.reduce((sum, w) => sum + hundredths(w), ZERO)) / 100;
}

export type WeightedItem = { id: string; maxScore: number; weight: number };

/**
 * คะแนนรวมถ่วงน้ำหนัก (เต็ม 100) ปัด 2 ตำแหน่ง
 *   รวม = Σ (คะแนน ÷ คะแนนเต็ม × น้ำหนัก)
 * ช่องที่ยังไม่มีคะแนนนับเป็น 0 · คืน null เมื่อน้ำหนักรวมไม่เท่ากับ 100 (FR-09.2 — ยังคำนวณเกรดไม่ได้)
 */
export function weightedTotal(
  items: readonly WeightedItem[],
  scores: ReadonlyMap<string, number | null>,
): number | null {
  if (items.length === 0 || weightSum(items.map((i) => i.weight)) !== 100) return null;

  // total×100 = Σ S·W / M  (S, W, M เป็นหน่วย 1/100 ทั้งหมด) — บวกเศษส่วนแบบตรงตัว
  let num = ZERO;
  let den = ONE;
  for (const item of items) {
    const m = hundredths(item.maxScore);
    const score = scores.get(item.id);
    if (m <= ZERO || score === null || score === undefined) continue;
    const a = hundredths(score) * hundredths(item.weight);
    num = num * m + a * den;
    den = den * m;
  }
  // ปัดครึ่งขึ้น (ค่าทั้งหมดไม่ติดลบ)
  const rounded = (TWO * num + den) / (TWO * den);
  return Number(rounded) / 100;
}

/** เกรดของคะแนนรวม — เกณฑ์เรียงจากสูงไปต่ำ ได้แถบแรกที่ถึงเกณฑ์ */
export function gradeFor(total: number | null, scale: readonly GradeBand[]): string | null {
  if (total === null) return null;
  return scale.find((band) => total >= band.min)?.grade ?? null;
}

/** อ่านเกณฑ์จาก `Course.gradeScale` — ค่าเสีย/ว่างใช้ค่าตั้งต้น */
export function parseGradeScale(value: unknown): GradeBand[] {
  if (!Array.isArray(value)) return [...DEFAULT_GRADE_SCALE];
  const bands = value.flatMap((raw) => {
    const b = raw as Partial<GradeBand>;
    return typeof b?.grade === "string" && typeof b.min === "number" ? [{ grade: b.grade, min: b.min }] : [];
  });
  if (bands.length === 0 || bandsError(bands)) return [...DEFAULT_GRADE_SCALE];
  return bands;
}

/** ตรวจโครงของเกณฑ์: เกรดไม่ซ้ำ · ขั้นต่ำเรียงจากมากไปน้อยไม่ซ้ำ · แถบสุดท้ายเริ่มที่ 0 (ทุกคะแนนได้เกรด) */
export function bandsError(bands: readonly GradeBand[]): string | null {
  if (bands.length < 2) return "เกณฑ์ต้องมีอย่างน้อย 2 ระดับ";
  if (new Set(bands.map((b) => b.grade.trim().toUpperCase())).size !== bands.length) return "ชื่อเกรดซ้ำกัน";
  for (let i = 1; i < bands.length; i += 1) {
    if (bands[i]!.min >= bands[i - 1]!.min) return "คะแนนขั้นต่ำต้องเรียงจากมากไปน้อยและไม่ซ้ำกัน";
  }
  if (bands.at(-1)!.min !== 0) return "เกรดสุดท้ายต้องเริ่มที่ 0 เพื่อให้ทุกคะแนนมีเกรด";
  return null;
}
