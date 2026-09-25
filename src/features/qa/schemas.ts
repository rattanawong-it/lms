import { z } from "zod";

/** M13 · FR-13.1–13.3 — ตรวจข้อมูลถาม-ตอบ (ใช้ร่วม client/server) · เนื้อหาเป็นข้อความล้วน (Q5) */

export const QA_TITLE_MAX = 150;
export const QA_BODY_MAX = 5_000;
/** ผู้เขียนแก้/ลบของตัวเองได้ภายในกี่นาที (และต้องยังไม่มีคนตอบ) */
export const QA_EDIT_WINDOW_MIN = 15;
export const QA_PAGE_SIZE = 20;

export const QA_FILTERS = ["all", "unanswered", "resolved"] as const;
export type QaFilter = (typeof QA_FILTERS)[number];

export const QA_FILTER_LABEL: Record<QaFilter, string> = {
  all: "ทั้งหมด",
  unanswered: "ยังไม่มีคำตอบ",
  resolved: "แก้ไขแล้ว",
};

/** ช่อง checkbox/ค่าเปิดปิดส่งมาเป็น "on"/"true"/"false" หรือไม่ส่งมาเลย */
const flag = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .nullish()
  .transform((v) => v === "on" || v === "true");

const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const title = z
  .string("กรุณากรอกหัวข้อคำถาม")
  .trim()
  .min(1, "กรุณากรอกหัวข้อคำถาม")
  .max(QA_TITLE_MAX, `หัวข้อยาวได้ไม่เกิน ${QA_TITLE_MAX} ตัวอักษร`);

const body = (empty: string) =>
  z
    .string(empty)
    // ขึ้นบรรทัดได้ แต่ตัดช่องว่างหัวท้าย และบีบบรรทัดว่างที่ติดกันเกิน 2 บรรทัด
    .transform((v) => v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(1, empty).max(QA_BODY_MAX, `ข้อความยาวได้ไม่เกิน ${QA_BODY_MAX.toLocaleString("th-TH")} ตัวอักษร`));

export const createThreadSchema = z.object({
  courseId: z.cuid("ไม่พบคอร์ส"),
  lessonId: optionalId,
  title,
  body: body("กรุณาเขียนรายละเอียดคำถาม"),
});

export const replySchema = z.object({
  threadId: z.cuid("ไม่พบกระทู้"),
  parentId: optionalId,
  body: body("กรุณาเขียนคำตอบ"),
});

export const editThreadSchema = z.object({
  id: z.cuid("ไม่พบกระทู้"),
  title,
  body: body("กรุณาเขียนรายละเอียดคำถาม"),
});

export const editPostSchema = z.object({
  id: z.cuid("ไม่พบคำตอบ"),
  body: body("กรุณาเขียนคำตอบ"),
});

export const qaIdSchema = z.object({ id: z.cuid("ไม่พบรายการ") });

export const qaFlagSchema = z.object({ id: z.cuid("ไม่พบรายการ"), value: flag });

/** อ่านค่าตัวกรองจาก URL แบบไม่เชื่อค่า — ค่าแปลกใช้ค่าเริ่มต้น */
export function parseQaParams(
  params: Record<string, string | string[] | undefined>,
  defaultFilter: QaFilter = "all",
): { filter: QaFilter; lessonId: string | null; page: number } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const f = one(params.filter);
  const lesson = one(params.lesson);
  const page = Number.parseInt(one(params.page) ?? "1", 10);
  return {
    filter: (QA_FILTERS as readonly string[]).includes(f ?? "") ? (f as QaFilter) : defaultFilter,
    lessonId: lesson && z.cuid().safeParse(lesson).success ? lesson : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}
