import "server-only";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

/**
 * CHANGELOG #55 — หาและลบไฟล์ (Asset + object ใน storage) ที่ไม่มีที่ใดอ้างถึงแล้ว
 * เรียกจาก cron `cleanup` เท่านั้น
 *
 * Asset ถูกอ้างถึงได้ 3 แบบ — **เพิ่มที่อ้างถึงใหม่เมื่อไรต้องเพิ่มใน SQL ของ `findOrphanAssets()` ด้วย ไม่งั้นไฟล์ถูกลบทิ้ง**
 * 1. relation: `Lesson.assetId` · `LessonAttachment` · `SubmissionFile`
 * 2. object key: `Course.coverKey`
 * 3. รหัส Asset ฝังในข้อความ/JSON: `/api/media/<id>` ใน rich text (คำอธิบายคอร์ส บทเรียน โจทย์/เฉลย คำสั่งงาน ประกาศ)
 *    · `User.image` (รูปโปรไฟล์) · `Course.certificateTemplate` (โลโก้/ลายเซ็น) · `SystemSetting.value` (โลโก้ระบบ)
 *    ค้นด้วย `strpos(…, id)` — รหัสเป็น cuid ยาว 25 ตัว ชนกับข้อความอื่นโดยบังเอิญไม่ได้ในทางปฏิบัติ
 *    (ถ้าชนก็แค่ไม่ลบ — พลาดไปทางปลอดภัย)
 *
 * `AuditLog` ไม่นับเป็นการอ้างถึง (เป็นประวัติ ไม่ใช่เนื้อหาที่แสดงอยู่)
 */
export type OrphanAsset = { id: string; key: string; size: bigint; status: string };

export async function findOrphanAssets(readyBefore: Date, staleBefore: Date, limit: number): Promise<OrphanAsset[]> {
  return db.$queryRaw<OrphanAsset[]>`
    SELECT a.id, a.key, a.size, a.status::text AS status
    FROM "Asset" a
    WHERE (
      (a.status = 'READY' AND a."createdAt" < ${readyBefore})
      OR (a.status <> 'READY' AND a."createdAt" < ${staleBefore})
    )
    AND NOT EXISTS (SELECT 1 FROM "Lesson" l WHERE l."assetId" = a.id OR strpos(l.content::text, a.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM "LessonAttachment" x WHERE x."assetId" = a.id)
    AND NOT EXISTS (SELECT 1 FROM "SubmissionFile" f WHERE f."assetId" = a.id)
    AND NOT EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c."coverKey" = a.key
         OR strpos(c.description::text, a.id) > 0
         OR strpos(c."certificateTemplate"::text, a.id) > 0
    )
    AND NOT EXISTS (
      SELECT 1 FROM "Question" q
      WHERE strpos(q.prompt::text, a.id) > 0 OR strpos(q.explanation::text, a.id) > 0
    )
    AND NOT EXISTS (SELECT 1 FROM "Assignment" g WHERE strpos(g.instructions::text, a.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM "Announcement" n WHERE strpos(n.body::text, a.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE strpos(u.image, a.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM "SystemSetting" t WHERE strpos(t.value::text, a.id) > 0)
    ORDER BY a."createdAt"
    LIMIT ${limit}
  `;
}

export type PurgeResult = { deleted: OrphanAsset[]; failed: number };

/**
 * ลบ object ใน storage ก่อน แล้วค่อยลบแถว Asset — ลบ object ไม่สำเร็จ = เก็บแถวไว้ให้รอบหน้าลองใหม่
 * (S3 ลบ key ที่ไม่มีอยู่แล้วถือว่าสำเร็จ จึงไม่ค้างถาวร)
 */
export async function purgeAssets(assets: OrphanAsset[]): Promise<PurgeResult> {
  const deleted: OrphanAsset[] = [];
  let failed = 0;
  for (const asset of assets) {
    try {
      await deleteObject(asset.key);
      deleted.push(asset);
    } catch (error) {
      failed++;
      console.error("[cleanup] ลบไฟล์ใน storage ไม่สำเร็จ", asset.key, error);
    }
  }
  if (deleted.length > 0) {
    await db.asset.deleteMany({ where: { id: { in: deleted.map((a) => a.id) } } });
  }
  return { deleted, failed };
}
