import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildObjectKey, createMultipart, presignPut, presignUploadPart } from "@/lib/storage";
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  checkUpload,
} from "@/lib/upload-limits";
import { presignInputSchema } from "@/features/uploads/schemas";
import { isFailure, jsonError, requireSignedIn, requireUploader } from "@/features/uploads/service";
import { authorizeSubmissionUpload } from "@/features/assignments/lib/upload-access";
import { AssetKind } from "@/generated/prisma/enums";

/**
 * FR-05.1 — ขอ presigned URL เพื่ออัปโหลดไฟล์ตรงไปยัง storage
 * ไฟล์ไม่ผ่าน app server เลย (system-design §9 Scalability)
 *
 * ไฟล์เล็กกว่า MULTIPART_THRESHOLD อัปโหลดทีเดียวจบ ที่เหลือใช้ multipart ตาม §5.8
 *
 * มี `assignmentId` = ไฟล์ส่งงาน (M08) — ผู้ใช้คนไหนก็ขอได้ แต่ต้องผ่านด่านของงานนั้น
 * ไม่มี = อัปโหลดทั่วไป เฉพาะผู้สอนขึ้นไป
 */
export async function POST(request: Request) {
  const signedIn = await requireSignedIn();
  if (isFailure(signedIn)) return signedIn.response;

  const parsed = presignInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400).response;
  }

  const { kind, mime, size, originalName, assignmentId } = parsed.data;

  const actor = assignmentId ? signedIn : await requireUploader();
  if (isFailure(actor)) return actor.response;
  if (assignmentId) {
    if (kind !== AssetKind.FILE) return jsonError("ไฟล์ส่งงานต้องเป็นชนิดไฟล์ทั่วไป", 400).response;
    const allowed = await authorizeSubmissionUpload(actor, assignmentId, { name: originalName, mime, size });
    if (!allowed.ok) return jsonError(allowed.message, allowed.status).response;
  }

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
