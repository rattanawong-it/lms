import { z } from "zod";

/** M17 · FR-17.4 PDPA — ส่งออกข้อมูลตนเอง และคำขอลบบัญชี (ใช้ร่วม client/server) */

/** ชื่อที่แสดงแทนผู้ใช้ที่ลบบัญชีแล้ว (ใบประกาศที่ `/verify`, กระทู้, รีวิว, สมุดคะแนน) */
export const DELETED_USER_NAME = "ผู้ใช้ที่ลบบัญชีแล้ว";

/** โดเมน `.invalid` ตาม RFC 2606 — รับประกันว่าส่งอีเมลไม่ถึงใครแน่นอน และยังคง unique ต่อผู้ใช้ */
export const deletedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;

/** ส่งออกข้อมูลได้วันละ 3 ครั้ง (phase-3-plan ขั้น 7) */
export const EXPORT_QUOTA = { windowSec: 24 * 60 * 60, max: 3 };

export const deletionRequestSchema = z.object({
  /** บัญชีที่มีรหัสผ่าน — ยืนยันด้วยรหัสผ่าน · บัญชี Google อย่างเดียว — พิมพ์อีเมลของตนเองแทน */
  confirm: z.string({ error: "กรุณายืนยันตัวตน" }).min(1, "กรุณายืนยันตัวตน").max(128),
  reason: z
    .string()
    .trim()
    .max(500, "เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร")
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const deletionDecisionSchema = z.object({
  userId: z.cuid("ไม่พบคำขอ"),
});

export const deletionRejectSchema = deletionDecisionSchema.extend({
  reason: z
    .string({ error: "กรุณาระบุเหตุผลที่ปฏิเสธ" })
    .trim()
    .min(3, "กรุณาระบุเหตุผลที่ปฏิเสธ")
    .max(500, "เหตุผลยาวได้ไม่เกิน 500 ตัวอักษร"),
});
