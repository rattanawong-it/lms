/**
 * M17 · FR-17.1 — จัดการค่า JSON ของ `AuditLog.before/after` (pure — ใช้ได้ทั้งสองฝั่งและใน unit test)
 */

/** ชื่อฟิลด์ที่ห้ามลง audit — รหัสผ่าน/โทเค็น/secret ไม่ว่าจะซ้อนอยู่ชั้นไหน */
const SECRET_KEY = /pass(word|wd)|token|secret|api[_-]?key|otp/i;

export const REDACTED = "[ซ่อน]";
export const SCRUBBED = "[ลบแล้ว]";

/** แทนค่าของฟิลด์ลับด้วย `[ซ่อน]` · ค่าที่ไม่ใช่ JSON ธรรมดา (Date ฯลฯ) ปล่อยให้ Prisma แปลงเอง */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? REDACTED : redactSecrets(v);
    return out as T;
  }
  return value;
}

/**
 * FR-17.4 — ลบข้อมูลที่ระบุตัวตนออกจากค่า JSON (ใช้ตอน anonymize บัญชี)
 * ทุกสตริงที่มีคำใดคำหนึ่งใน `needles` (ไม่สนตัวพิมพ์) ถูกแทนเฉพาะส่วนนั้นด้วย `[ลบแล้ว]`
 */
export function scrubStrings<T>(value: T, needles: string[]): T {
  const words = needles.map((n) => n.trim()).filter((n) => n.length >= 3);
  if (words.length === 0) return value;
  // คำยาวก่อน — ชื่อที่เป็นส่วนหนึ่งของอีเมลจะไม่ตัดอีเมลเหลือครึ่งเดียว
  words.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(pattern, SCRUBBED);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v)) out[k] = walk(inner);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export type DiffRow = { key: string; before: string | null; after: string | null; changed: boolean };

const show = (v: unknown): string | null => {
  if (v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * FR-17.2 — ตารางเทียบก่อน/หลังรายฟิลด์ (ชั้นบนสุด) ให้หน้า audit
 * ค่าที่ไม่ใช่ object ทั้งคู่แสดงเป็นแถวเดียว · ฟิลด์ที่เท่ากันยังแสดง แต่ `changed = false`
 */
export function auditDiff(before: unknown, after: unknown): DiffRow[] {
  if (before == null && after == null) return [];
  if (!(isRecord(before) || before == null) || !(isRecord(after) || after == null)) {
    const b = show(before ?? undefined);
    const a = show(after ?? undefined);
    return [{ key: "ค่า", before: b, after: a, changed: b !== a }];
  }
  const b = before ?? {};
  const a = after ?? {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map((key) => {
    const bv = show(b[key]);
    const av = show(a[key]);
    return { key, before: bv, after: av, changed: bv !== av };
  });
}
