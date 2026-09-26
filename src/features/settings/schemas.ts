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

/** M18 · FR-18.2 — ผู้ขายที่พิมพ์บนใบเสร็จ (`/admin/settings`) · ยังไม่ได้ตั้ง = ใช้ชื่อระบบ */
export const SELLER_SETTING_KEY = "seller";

export type Seller = { name: string; taxId: string | null; address: string | null; phone: string | null };

const optionalText = (max: number, message: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, message).nullish());

export const sellerSchema = z.object({
  name: z
    .string({ error: "กรุณากรอกชื่อผู้ขาย" })
    .trim()
    .min(2, "ชื่อผู้ขายต้องยาวอย่างน้อย 2 ตัวอักษร")
    .max(150, "ชื่อผู้ขายยาวได้ไม่เกิน 150 ตัวอักษร"),
  taxId: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || null : v),
    z.string().regex(/^\d{13}$/, "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก").nullish(),
  ),
  address: optionalText(300, "ที่อยู่ยาวได้ไม่เกิน 300 ตัวอักษร"),
  phone: optionalText(40, "เบอร์โทรยาวได้ไม่เกิน 40 ตัวอักษร"),
});

/** อ่านค่าที่เก็บใน DB — ผิดรูปแบบ/ยังไม่ตั้ง ถอยไปใช้ชื่อระบบ */
export function parseSeller(value: unknown, fallbackName: string): Seller {
  const parsed = sellerSchema.safeParse(value);
  if (!parsed.success) return { name: fallbackName, taxId: null, address: null, phone: null };
  const { name, taxId, address, phone } = parsed.data;
  return { name, taxId: taxId ?? null, address: address ?? null, phone: phone ?? null };
}
