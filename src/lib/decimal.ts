/**
 * คะแนนทุกตารางเป็น `Decimal` ของ Prisma — ส่งเข้า Client Component ตรง ๆ ไม่ได้
 * (ไม่ใช่ plain object) และบวกลบด้วย float แล้วเพี้ยน ไฟล์นี้จึงเป็นจุดเดียวที่แปลงไปมา
 *
 * pure function ไม่ import Prisma runtime — client และ unit test ใช้ได้
 */
type DecimalLike = { toNumber(): number } | number | string;

/** Decimal → number ปัด 2 ตำแหน่ง (ความละเอียดของคอลัมน์คะแนนทั้งหมด) */
export function toScore(value: DecimalLike): number;
export function toScore(value: DecimalLike | null | undefined): number | null;
export function toScore(value: DecimalLike | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "object" ? value.toNumber() : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** 1 → "1" · 1.5 → "1.5" · 2.25 → "2.25" (ไม่เติมศูนย์ท้าย) */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}
