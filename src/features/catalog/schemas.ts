import { z } from "zod";

/** M03 · FR-03.2 — พารามิเตอร์ของหน้าคลังคอร์ส (อ่านจาก query string) */
export const CATALOG_SORTS = ["newest", "popular", "rating"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const SORT_LABEL: Record<CatalogSort, string> = {
  newest: "ใหม่ล่าสุด",
  popular: "ยอดนิยม",
  rating: "คะแนนรีวิว",
};

export const CATALOG_PAGE_SIZE = 12;

/**
 * ทุกฟิลด์เป็น optional และมีค่าตั้งต้นเสมอ เพราะ URL ที่ผู้ใช้แก้เองไม่ควรทำให้หน้าพัง
 * ค่าที่ไม่รู้จักจะถูกตีเป็นค่าตั้งต้นแทนการโยน error
 */
export const catalogParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  category: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v && v !== "all" ? v : undefined)),
  departmentId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v !== "all" ? v : undefined)),
  level: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v && v !== "all" ? v : undefined)),
  sort: z.enum(CATALOG_SORTS).catch("newest").default("newest"),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});

export type CatalogParams = z.output<typeof catalogParamsSchema>;

/** แปลง searchParams ของ Next.js เป็นพารามิเตอร์ที่ผ่านการตรวจแล้ว */
export function parseCatalogParams(
  input: Record<string, string | string[] | undefined>,
): CatalogParams {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return catalogParamsSchema.parse({
    q: first(input.q),
    category: first(input.category),
    departmentId: first(input.departmentId),
    level: first(input.level),
    sort: first(input.sort),
    page: first(input.page),
  });
}
