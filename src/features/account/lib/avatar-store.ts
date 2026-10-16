import "server-only";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { AVATAR_KEY_PREFIX } from "@/lib/object-key";
import { avatarAssetId } from "@/features/account/lib/avatar";

/**
 * ลบไฟล์รูปโปรไฟล์ที่ผู้ใช้อัปโหลดเอง (FR-01.5 · system-design §5.9)
 *
 * ลบเฉพาะ Asset ที่ผู้ใช้คนนั้นอัปโหลดและ key อยู่ใต้ `avatar/` — URL ของ Google
 * หรือ id ที่ชี้ไปภาพปก/รูปบทความ (ถ้ามีคนตั้งเองทางอื่น) จะไม่ถูกแตะ
 * ไม่ throw: รูปเป็นข้อมูลส่วนบุคคลที่ควรลบ แต่ลบไม่สำเร็จต้องไม่ทำให้การเปลี่ยนรูปล้ม
 */
export async function deleteAvatarFile(image: string | null | undefined, userId: string): Promise<void> {
  const assetId = avatarAssetId(image);
  if (!assetId) return;

  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { key: true, uploadedById: true } });
  if (!asset || asset.uploadedById !== userId || !asset.key.startsWith(AVATAR_KEY_PREFIX)) return;

  try {
    // ลบแถวก่อน — ถ้ามี foreign key ชี้อยู่จะล้มตรงนี้ และไฟล์ยังอยู่ให้ที่อื่นใช้ต่อ
    await db.asset.delete({ where: { id: assetId } });
    await deleteObject(asset.key);
  } catch (error) {
    console.error("[avatar] ลบไฟล์รูปโปรไฟล์เดิมไม่สำเร็จ", assetId, error);
  }
}
