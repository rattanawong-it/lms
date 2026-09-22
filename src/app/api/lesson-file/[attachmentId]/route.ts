import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/rbac";
import { presignGet } from "@/lib/storage";
import { getLessonAccess } from "@/features/enrollment/queries";
import { AssetStatus } from "@/generated/prisma/enums";

/**
 * M05 · FR-05.7 — ไฟล์ประกอบบทเรียน
 *
 * เปิดให้เฉพาะไฟล์ที่ผู้สอนติ๊ก "ให้ดาวน์โหลดได้" เท่านั้น ไฟล์ที่ไม่ติ๊กจะตอบ 403
 * ไม่ใช่ 404 เพราะผู้เรียนเห็นชื่อไฟล์อยู่ในหน้าเรียนแล้ว การซ่อนไม่ได้ปิดอะไรเพิ่ม
 *
 * ตอบเป็น redirect ไป signed URL อายุ 5 นาที (FR-15.7) แทนการ stream ผ่านเซิร์ฟเวอร์
 * เพราะเป็นการดาวน์โหลดที่ผู้สอนอนุญาตแล้ว — ไม่มีอะไรต้องป้องกันเพิ่มหลังจากนี้
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  await requireApiUser();
  const { attachmentId } = await params;

  const attachment = await db.lessonAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      downloadable: true,
      lessonId: true,
      asset: { select: { key: true, originalName: true, status: true } },
    },
  });
  if (!attachment) notFound();

  // ตรวจสิทธิ์จากบทเรียนที่ไฟล์นี้สังกัดจริง ไม่ใช่จากค่าที่ client ส่งมา
  const access = await getLessonAccess(attachment.lessonId);
  if (!access) notFound();
  if (!access.unlocked) forbidden();
  if (!attachment.downloadable) forbidden();
  if (attachment.asset.status !== AssetStatus.READY) notFound();

  const url = await presignGet(attachment.asset.key, {
    downloadName: attachment.asset.originalName,
  });

  return Response.redirect(url, 302);
}
