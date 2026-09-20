import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildObjectKey, createMultipart, presignPut, presignUploadPart } from "@/lib/storage";
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  checkUpload,
} from "@/lib/upload-limits";
import { presignInputSchema } from "@/features/uploads/schemas";
import { isFailure, jsonError, requireUploader } from "@/features/uploads/service";

/**
 * FR-05.1 — ขอ presigned URL เพื่ออัปโหลดไฟล์ตรงไปยัง storage
 * ไฟล์ไม่ผ่าน app server เลย (system-design §9 Scalability)
 *
 * ไฟล์เล็กกว่า MULTIPART_THRESHOLD อัปโหลดทีเดียวจบ ที่เหลือใช้ multipart ตาม §5.8
 */
export async function POST(request: Request) {
  const actor = await requireUploader();
  if (isFailure(actor)) return actor.response;

  const parsed = presignInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400).response;
  }

  const { kind, mime, size, originalName } = parsed.data;

  // ด่านแรก — เชื่อค่าที่ client แจ้งไว้ก่อนเพื่อกันไฟล์ใหญ่/ผิดชนิดตั้งแต่ต้น
  // ของจริงตรวจซ้ำจาก magic bytes ตอน complete
  const check = checkUpload(kind, mime, size);
  if (!check.ok) return jsonError(check.message, 400).response;

  const key = buildObjectKey(kind, originalName);
  const asset = await db.asset.create({
    data: {
      key,
      kind,
      mime,
      size: BigInt(size),
      originalName,
      uploadedById: actor.id,
    },
    select: { id: true },
  });

  if (size <= MULTIPART_THRESHOLD) {
    return NextResponse.json({
      ok: true,
      mode: "single" as const,
      assetId: asset.id,
      url: await presignPut(key, mime),
    });
  }

  const uploadId = await createMultipart(key, mime);
  const partCount = Math.ceil(size / MULTIPART_PART_SIZE);
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, index) => ({
      partNumber: index + 1,
      url: await presignUploadPart(key, uploadId, index + 1),
    })),
  );

  return NextResponse.json({
    ok: true,
    mode: "multipart" as const,
    assetId: asset.id,
    uploadId,
    partSize: MULTIPART_PART_SIZE,
    parts,
  });
}
