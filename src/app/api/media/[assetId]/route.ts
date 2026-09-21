import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
import { UPLOAD_RULES } from "@/lib/upload-limits";

/**
 * เสิร์ฟ **รูปภาพ** ที่ผู้สอนอัปโหลด (ภาพปกคอร์สและรูปในบทความ) ผ่าน URL ที่คงที่
 *
 * ทำไมไม่ใช้ presigned URL ตรง ๆ เหมือนที่อื่น
 * - ลายเซ็นเปลี่ยนทุกครั้งที่ render ทำให้ image optimizer ของ Next แคชอะไรไม่ได้เลย
 *   และต้องประกาศโดเมนของ storage ใน `images.remotePatterns` ซึ่งผูกแอปเข้ากับ vendor (NFR-10)
 * - URL คงที่ทำให้ทั้งเบราว์เซอร์และ optimizer แคชได้ โดย object key ยังไม่หลุดออกไปถึง client
 *
 * ขอบเขตโดยตั้งใจ: **รับเฉพาะ AssetKind.IMAGE** เท่านั้น
 * วิดีโอ/PDF/ไฟล์ประกอบเป็นเนื้อหาที่ต้องตรวจ enrollment ก่อนเปิดให้ดู (FR-15.7)
 * ของพวกนั้นจะได้ signed URL อายุสั้นผ่านเส้นทางของตัวเองในขั้น 6 ไม่ใช่ที่นี่
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { key: true, kind: true, mime: true, status: true },
  });

  // ไม่แยกแยะว่า "ไม่มีไฟล์" หรือ "ไม่ใช่รูป" — ตอบ 404 เหมือนกันหมด จะได้ไม่บอกใบ้ว่ามี asset นี้อยู่
  if (!asset || asset.kind !== "IMAGE" || asset.status !== "READY") {
    return new Response("ไม่พบรูปภาพ", { status: 404 });
  }
  if (!UPLOAD_RULES.IMAGE.mimes.includes(asset.mime)) {
    return new Response("ไม่พบรูปภาพ", { status: 404 });
  }

  const object = await getObjectStream(asset.key);
  if (!object) return new Response("ไม่พบรูปภาพ", { status: 404 });

  return new Response(object.body, {
    headers: {
      // ใช้ชนิดที่ตรวจด้วย magic bytes ตอนอัปโหลดแล้ว ไม่ใช่ค่าที่ storage แจ้งกลับมา
      "Content-Type": asset.mime,
      "Content-Disposition": "inline",
      ...(object.size != null ? { "Content-Length": String(object.size) } : {}),
      ...(object.etag ? { ETag: object.etag } : {}),
      // ไฟล์หนึ่ง asset id ไม่เคยถูกเขียนทับ จึงแคชยาวได้ปลอดภัย
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
