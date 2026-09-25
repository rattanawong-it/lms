/**
 * M18 — เงินบาท ↔ สตางค์ (pure · client ใช้ได้)
 *
 * gateway รับยอดเป็นหน่วยย่อยจำนวนเต็ม (สตางค์) · DB เก็บ `Decimal(10,2)` เป็นบาท
 * แปลงจากสตริงทศนิยมตรง ๆ ไม่ผ่าน float — 19.99 * 100 ใน JavaScript ได้ 1998.9999999999998
 */

type DecimalLike = { toString(): string };

const BAHT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** บาท (Decimal/สตริง/number) → สตางค์ · ค่าติดลบ ทศนิยมเกิน 2 ตำแหน่ง หรือไม่ใช่ตัวเลข → throw */
export function toSatang(value: DecimalLike | string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.toString().trim();
  const match = BAHT_PATTERN.exec(text);
  if (!match) throw new Error(`จำนวนเงินไม่ถูกต้อง: ${text}`);
  const satang = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(satang)) throw new Error(`จำนวนเงินเกินขอบเขต: ${text}`);
  return satang;
}

/** สตางค์ → สตริงบาท 2 ตำแหน่ง ("1234.50") สำหรับเขียนลง Decimal */
export function fromSatang(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0) throw new Error(`จำนวนสตางค์ไม่ถูกต้อง: ${satang}`);
  return `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, "0")}`;
}

const THB = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });

/** แสดงผล "฿1,234.50" · ลงตัวแสดงแบบไม่มีทศนิยม ("฿990") */
export function formatBaht(value: DecimalLike | string | number): string {
  const satang = toSatang(value);
  const text = THB.format(satang / 100);
  return satang % 100 === 0 ? text.replace(/\.00$/, "") : text;
}
