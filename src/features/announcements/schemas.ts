import { z } from "zod";
import { AnnouncementScope } from "@/generated/prisma/enums";

/** M11 · FR-11.1 — ตรวจข้อมูลประกาศ (ใช้ร่วม client/server) */

export const ANNOUNCEMENT_TITLE_MAX = 200;

/** ช่อง checkbox ส่ง "on" มาเมื่อติ๊ก และไม่ส่งอะไรมาเลยเมื่อไม่ติ๊ก */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .nullish()
  .transform((v) => v === "on" || v === "true");

const title = z
  .string("กรุณากรอกหัวข้อประกาศ")
  .trim()
  .min(1, "กรุณากรอกหัวข้อประกาศ")
  .max(ANNOUNCEMENT_TITLE_MAX, `หัวข้อประกาศยาวได้ไม่เกิน ${ANNOUNCEMENT_TITLE_MAX} ตัวอักษร`);

/** ช่องที่เป็น id และอาจส่งมาเป็นค่าว่าง */
const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * สร้างประกาศใหม่ — เนื้อหา (Tiptap JSON) ตรวจแยกด้วย `parseRichTextField()`
 * เพราะต้องผ่านตัวทำความสะอาดฝั่ง server ไม่ใช่แค่เช็คว่าเป็นสตริง
 */
export const createAnnouncementSchema = z
  .object({
    scope: z.enum(AnnouncementScope, "กรุณาเลือกระดับของประกาศ"),
    departmentId: optionalId,
    courseId: optionalId,
    title,
    pinned: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.scope === AnnouncementScope.DEPARTMENT && !value.departmentId) {
      ctx.addIssue({ code: "custom", path: ["departmentId"], message: "กรุณาเลือกคณะที่จะประกาศ" });
    }
    if (value.scope === AnnouncementScope.COURSE && !value.courseId) {
      ctx.addIssue({ code: "custom", path: ["courseId"], message: "ไม่พบคอร์สที่จะประกาศ" });
    }
  });

/** แก้ประกาศ — เปลี่ยนระดับหรือกลุ่มผู้รับไม่ได้ เพราะแจ้งเตือนถูกส่งไปแล้ว */
export const updateAnnouncementSchema = z.object({
  id: z.cuid("ไม่พบประกาศ"),
  title,
  pinned: checkbox,
});

export const announcementIdSchema = z.object({
  id: z.cuid("ไม่พบประกาศ"),
});

export const pinAnnouncementSchema = z.object({
  id: z.cuid("ไม่พบประกาศ"),
  pinned: checkbox,
});

export const SCOPE_LABEL: Record<AnnouncementScope, string> = {
  [AnnouncementScope.GLOBAL]: "ทั้งมหาวิทยาลัย",
  [AnnouncementScope.DEPARTMENT]: "ระดับคณะ",
  [AnnouncementScope.COURSE]: "ระดับคอร์ส",
};
