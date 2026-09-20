/**
 * NFR-03 — กัน open redirect
 * รับเฉพาะ path ภายในระบบเท่านั้น (ขึ้นต้นด้วย / และไม่ใช่ // หรือ /\)
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
