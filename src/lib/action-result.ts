import type { ZodError } from "zod";

/** ผลลัพธ์มาตรฐานของ Server Action — ใช้ร่วมกันทุกฟีเจอร์ */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** แปลง ZodError เป็น map ของ field → ข้อความภาษาไทย (เอาข้อความแรกของแต่ละฟิลด์) */
export function zodToFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
