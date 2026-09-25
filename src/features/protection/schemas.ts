import { z } from "zod";
import { ScreenEvent } from "@/generated/prisma/enums";

/** M15 — ข้อมูลการตั้งค่าการป้องกัน และรายงานเหตุการณ์หน้าจอ (ใช้ร่วม client/server) */

/** FR-15.9 — คีย์ของสวิตช์ระดับระบบใน `SystemSetting` */
export const PROTECTION_SETTING_KEY = "content-protection";

export const systemProtectionSchema = z.object({
  /** ปิดที่นี่แล้วทุกคอร์สจะไม่ป้องกันเลย ไม่ว่าคอร์สจะตั้งค่าไว้อย่างไร */
  enabled: z.coerce.boolean(),
});

/** FR-15.8 — รายงานเหตุการณ์ที่น่าสงสัย ส่งเป็นชุดทุก 5 วินาที */
export const MAX_EVENTS_PER_BATCH = 20;

export const screenEventSchema = z.object({
  event: z.enum(ScreenEvent),
  lessonId: z.cuid().nullish(),
  /** รายละเอียดสั้น ๆ เช่น คีย์ที่กด — จำกัดความยาวเพราะมาจาก client */
  detail: z.string().max(120).nullish(),
});

export const screenEventBatchSchema = z.object({
  events: z.array(screenEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type ScreenEventInput = z.infer<typeof screenEventSchema>;

/** ช่วงเวลารวม event ก่อนส่งหนึ่งชุด (system-design §6.2) */
export const EVENT_FLUSH_MS = 5_000;

/** FR-15.5 — ลายน้ำสลับตำแหน่งใหม่ทุก 20–30 วินาที */
export const WATERMARK_SHIFT_MIN_MS = 20_000;
export const WATERMARK_SHIFT_MAX_MS = 30_000;

/** FR-15.8 — ตัวกรองรายงานเหตุการณ์หน้าจอ (ค่าอยู่ใน URL) · วันที่เป็น "YYYY-MM-DD" ตามเวลาไทย */
export type ScreenEventFilter = {
  q: string;
  event: ScreenEvent | null;
  from: string | null;
  to: string | null;
  page: number;
};

export function parseScreenEventFilter(input: Record<string, string | string[] | undefined>): ScreenEventFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const event = one(input.event);
  const page = Number.parseInt(one(input.page) ?? "1", 10);
  return {
    q: (one(input.q) ?? "").trim().slice(0, 100),
    event: event && (Object.values(ScreenEvent) as string[]).includes(event) ? (event as ScreenEvent) : null,
    from: date(one(input.from)),
    to: date(one(input.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}
