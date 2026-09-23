import { z } from "zod";

/** M10 · FR-10.2 / FR-10.3 / FR-10.5 — ใบประกาศ (ใช้ร่วม client/server · ข้อความ error ภาษาไทย) */

/** รหัสรูปแบบ LMS-ปี-XXXXXX (ตามที่ระบุใน schema) — ตัดตัวที่อ่านสับสน (0/O, 1/I/L) ออก */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_PATTERN = /^LMS-\d{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function generateCertificateCode(year: number, random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `LMS-${year}-${suffix}`;
}

/** รหัสที่ผู้ใช้พิมพ์/สแกนมา — ตัวพิมพ์เล็กและช่องว่างไม่นับ */
export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export const DEFAULT_CERTIFICATE_TEMPLATE = {
  heading: "ประกาศนียบัตร",
  body: "ขอมอบประกาศนียบัตรฉบับนี้เพื่อแสดงว่า\n{ชื่อ}\nได้ผ่านการเรียนหลักสูตร\n{คอร์ส}\nให้ไว้ ณ วันที่ {วันที่}",
  signerName: "",
  signerTitle: "",
  logoAssetId: null as string | null,
  signatureAssetId: null as string | null,
};

export type CertificateTemplate = typeof DEFAULT_CERTIFICATE_TEMPLATE;

const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));

export const certificateTemplateSchema = z.object({
  heading: z.string().trim().min(1, "กรุณาใส่หัวเรื่อง").max(80, "หัวเรื่องยาวได้ไม่เกิน 80 ตัวอักษร"),
  body: z
    .string()
    .transform((v) => v.replaceAll("\r\n", "\n").trim())
    .refine((v) => v.length > 0, "กรุณาเขียนข้อความในใบประกาศ")
    .refine((v) => v.length <= 1000, "ข้อความยาวได้ไม่เกิน 1,000 ตัวอักษร")
    .refine((v) => v.split("\n").length <= 12, "ข้อความมีได้ไม่เกิน 12 บรรทัด")
    .refine((v) => v.includes("{ชื่อ}"), "ข้อความต้องมี {ชื่อ} ของผู้ได้รับ"),
  signerName: z.string().trim().max(100, "ชื่อผู้ลงนามยาวได้ไม่เกิน 100 ตัวอักษร").default(""),
  signerTitle: z.string().trim().max(100, "ตำแหน่งผู้ลงนามยาวได้ไม่เกิน 100 ตัวอักษร").default(""),
  logoAssetId: optionalId,
  signatureAssetId: optionalId,
});

/** อ่านแม่แบบจาก `Course.certificateTemplate` — ค่าเสีย/ว่างใช้ค่าตั้งต้น */
export function parseCertificateTemplate(value: unknown): CertificateTemplate {
  const parsed = certificateTemplateSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_CERTIFICATE_TEMPLATE };
}

export const revokeSchema = z.object({
  reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(500, "เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร"),
});
