import { randomUUID } from "node:crypto";
import { AssetKind } from "@/generated/prisma/enums";

/**
 * สร้าง object key ของไฟล์ใน storage
 * แยกออกจาก `lib/storage.ts` (ซึ่งเป็น server-only) เพื่อให้ทดสอบได้ตรง ๆ
 *
 * ชื่อไฟล์เดิมของผู้ใช้ไม่ถูกนำมาใช้เป็น key เลย — เอาแค่นามสกุลที่ผ่านการกรองแล้ว
 * จึงกัน path traversal และกันการเดา key ของคนอื่น (system-design §6.1 ชั้น 1)
 */
const KIND_PREFIX: Record<AssetKind, string> = {
  VIDEO: "video",
  PDF: "pdf",
  IMAGE: "image",
  FILE: "file",
};

/** นามสกุลที่ยอมรับ: ตัวอักษร/ตัวเลขล้วน ไม่เกิน 8 ตัว นอกนั้นตัดทิ้ง */
export function safeExtension(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = originalName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
}

/** รูปแบบ: `<kind>/<ปี>/<เดือน>/<uuid><.ext>` */
export function buildObjectKey(
  kind: AssetKind,
  originalName: string,
  now = new Date(),
  uuid: () => string = randomUUID,
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${KIND_PREFIX[kind]}/${year}/${month}/${uuid()}${safeExtension(originalName)}`;
}
