/**
 * M09 · FR-09.2 — คะแนนรวมถ่วงน้ำหนัก (pure function — client/server/unit test ใช้ได้)
 * การตัดเกรด/ผ่าน-ไม่ผ่านจากคะแนนรวมอยู่ที่ `lib/curve.ts` (Score Curve · FR-09.6–09.9)
 *
 * คะแนนทุกคอลัมน์เป็น Decimal 2 ตำแหน่ง จึงแปลงเป็นจำนวนเต็มหน่วย 1/100 แล้วรวมเป็นเศษส่วนด้วย BigInt
 * ไม่มีการปัดระหว่างทาง — ปัดครั้งเดียวที่ 2 ตำแหน่ง (ปัดครึ่งขึ้น) · ตัดผลจากค่านี้ที่ตัดทศนิยมทิ้ง (`curveValue()`)
 */

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
