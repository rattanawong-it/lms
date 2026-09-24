import { z } from "zod";

/**
 * M12 · FR-12.1 — รหัสผูกบัญชี LINE และรูปแบบ webhook ที่ระบบสนใจ
 * ข้อความที่ bot ตอบกลับอยู่ที่นี่ที่เดียว (ภาษาไทย)
 */
export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_MINUTES = 10;
/** identifier ในตาราง `Verification` — value คือ userId เจ้าของรหัส */
export const LINK_CODE_PREFIX = "line-link:";

/** รหัสที่ผู้ใช้พิมพ์ใน LINE — ยอมให้มีช่องว่างคั่นหรือหัวท้าย เช่น "123 456" */
export function parseLinkCode(text: string): string | null {
  const digits = text.replace(/\s+/g, "");
  return new RegExp(`^[0-9]{${LINK_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

export const LINE_REPLY = {
  linked: "เชื่อมต่อบัญชี KRIRK LMS สำเร็จ ✅\nคุณจะได้รับการแจ้งเตือนทาง LINE ตามที่ตั้งค่าไว้ในหน้า “ตั้งค่าบัญชี › การแจ้งเตือน”",
  invalidCode: "รหัสไม่ถูกต้องหรือหมดอายุแล้ว\nกรุณากด “เชื่อมต่อ LINE” ในหน้า ตั้งค่าบัญชี › LINE ของ KRIRK LMS เพื่อรับรหัสใหม่ (ใช้ได้ 10 นาที)",
  tooMany: "ลองรหัสบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่",
  help: "สวัสดีครับ นี่คือบัญชีแจ้งเตือนของ KRIRK LMS\nเชื่อมต่อบัญชีได้โดยเข้า KRIRK LMS › ตั้งค่าบัญชี › LINE กด “เชื่อมต่อ LINE” แล้วพิมพ์รหัส 6 หลักที่ได้ในแชทนี้",
} as const;

/** ส่วนของ webhook ที่ใช้ — field อื่นปล่อยผ่าน (LINE เพิ่ม field ได้เรื่อย ๆ) */
export const lineWebhookSchema = z.object({
  events: z.array(
    z.object({
      type: z.string(),
      replyToken: z.string().optional(),
      source: z.object({ type: z.string(), userId: z.string().optional() }).optional(),
      message: z.object({ type: z.string(), text: z.string().optional() }).optional(),
    }),
  ),
});
export type LineWebhookEvent = z.infer<typeof lineWebhookSchema>["events"][number];
