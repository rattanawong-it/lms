import { NextResponse } from "next/server";
import { presignUploadPart } from "@/lib/storage";
import { signPartInputSchema } from "@/features/uploads/schemas";
import {
  findOwnPendingAsset,
  isFailure,
  jsonError,
  requireUploader,
} from "@/features/uploads/service";

/**
 * ขอ URL ของ part ใหม่ — ใช้ตอน part เดิมหมดอายุหรืออัปโหลดล้มแล้วต้องลองใหม่
 * (ไฟล์ 2 GB บนเน็ตช้าอาจใช้เวลานานกว่าอายุของ URL ชุดแรก)
 */
export async function POST(request: Request) {
  const actor = await requireUploader();
  if (isFailure(actor)) return actor.response;

  const parsed = signPartInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400).response;
  }

  const { assetId, uploadId, partNumber } = parsed.data;
  const asset = await findOwnPendingAsset(assetId, actor.id);
  if (!asset) return jsonError("ไม่พบไฟล์ที่กำลังอัปโหลด", 404).response;

  return NextResponse.json({
    ok: true,
    partNumber,
    url: await presignUploadPart(asset.key, uploadId, partNumber),
  });
}
