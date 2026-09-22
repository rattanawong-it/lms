import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/rbac";
import { getObjectStream } from "@/lib/storage";
import { getLessonAccess } from "@/features/enrollment/queries";
import { AssetKind, AssetStatus, LessonType } from "@/generated/prisma/enums";
import { UPLOAD_RULES } from "@/lib/upload-limits";

/**
 * M05 · FR-05.3 / FR-15.7 — เสิร์ฟไฟล์ **PDF** ของบทเรียนให้ pdf.js
 *
 * ทำไม PDF ถึง stream ผ่านที่นี่ ไม่ใช่ signed URL ตรงไป storage เหมือนวิดีโอ
 * - pdf.js ดึงไฟล์ด้วย fetch จึงติด CORS ถ้าข้ามโดเมนไป storage · ผ่านที่นี่เป็น same-origin
 * - object key ไม่หลุดออกไปถึง client เลย และไม่มีลิงก์ที่ copy ไปเปิดต่อนอกระบบได้
 * - ตรวจ enrollment ใหม่ **ทุก request** ไม่ใช่แค่ตอนออก URL ครั้งเดียว
 * - PDF เพดาน 50 MB จึงไม่หนักเท่าวิดีโอ (เพดาน 2 GB) ที่ต้องเลี่ยงการวิ่งผ่านเซิร์ฟเวอร์
 *
 * รองรับ `Range` ต่อให้ storage โดยตรง เพราะ pdf.js ทยอยขอทีละช่วงเมื่อไฟล์ใหญ่
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  await requireApiUser();
  const { lessonId } = await params;

  const access = await getLessonAccess(lessonId);
  if (!access) notFound();
  if (!access.unlocked) forbidden();
  if (access.lesson.type !== LessonType.PDF) notFound();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { asset: { select: { key: true, kind: true, mime: true, status: true } } },
  });

  const asset = lesson?.asset;
  if (
    !asset ||
    asset.kind !== AssetKind.PDF ||
    asset.status !== AssetStatus.READY ||
    !UPLOAD_RULES.PDF.mimes.includes(asset.mime)
  ) {
    notFound();
  }

  const range = request.headers.get("range");
  const object = await getObjectStream(asset.key, { range });
  if (!object) notFound();

  return new Response(object.body, {
    status: object.contentRange ? 206 : 200,
    headers: {
      // ใช้ชนิดที่ตรวจด้วย magic bytes ตอนอัปโหลด ไม่ใช่ค่าที่ storage แจ้งกลับมา
      "Content-Type": asset.mime,
      // ไม่มี `attachment` — ไฟล์นี้ให้ดูในหน้าเรียนเท่านั้น ไม่ใช่ให้ดาวน์โหลด (FR-05.3)
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      ...(object.contentRange ? { "Content-Range": object.contentRange } : {}),
      ...(object.size != null ? { "Content-Length": String(object.size) } : {}),
      // สิทธิ์เปลี่ยนได้ตลอด (หมดอายุ/ถูกถอน) จึงห้ามให้ proxy หรือเบราว์เซอร์เก็บไว้ใช้ซ้ำ
      "Cache-Control": "private, no-store",
    },
  });
}
