import { z } from "zod";

/** M17 · FR-17.3 — ตั้งค่าระบบ (ใช้ร่วม client/server) */

/** คีย์ใน `SystemSetting` */
export const BRANDING_SETTING_KEY = "branding";

export const DEFAULT_BRAND_NAME = "KRIRK LMS";

export type Branding = {
  name: string;
  /** รหัส Asset (IMAGE) ของโลโก้ · null = ใช้ไอคอนหมวกบัณฑิตตั้งต้น */
  logoAssetId: string | null;
};

export const DEFAULT_BRANDING: Branding = { name: DEFAULT_BRAND_NAME, logoAssetId: null };

export const brandingSchema = z.object({
  name: z
    .string({ error: "กรุณากรอกชื่อระบบ" })
    .trim()
    .min(2, "ชื่อระบบต้องยาวอย่างน้อย 2 ตัวอักษร")
    .max(40, "ชื่อระบบยาวได้ไม่เกิน 40 ตัวอักษร"),
  logoAssetId: z.preprocess((v) => (v === "" ? null : v), z.cuid("รูปโลโก้ไม่ถูกต้อง").nullish()),
});

/** อ่านค่าที่เก็บใน DB — ค่าผิดรูปแบบถอยไปใช้ค่าตั้งต้น ไม่ทำให้ทั้งเว็บพัง */
export function parseBranding(value: unknown): Branding {
  const parsed = brandingSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_BRANDING;
  return { name: parsed.data.name, logoAssetId: parsed.data.logoAssetId ?? null };
}
