import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { abortMultipart, completeMultipart, deleteObject, readHead, statObject } from "@/lib/storage";
import { mimeMatchesContent } from "@/lib/file-type";
import { checkUpload, formatBytes } from "@/lib/upload-limits";
import { completeInputSchema } from "@/features/uploads/schemas";
import {
  findOwnPendingAsset,
  isFailure,
  jsonError,
  requireUploader,
} from "@/features/uploads/service";

/** ลบไฟล์ที่ไม่ผ่านการตรวจออกจาก storage และทำเครื่องหมาย Asset ว่า FAILED */
async function rejectAsset(assetId: string, key: string, message: string) {
  await Promise.allSettled([
    deleteObject(key),
    db.asset.update({ where: { id: assetId }, data: { status: "FAILED" } }),
  ]);
  return jsonError(message, 400).response;
}

/**
 * FR-05.1 — ปิดงานอัปโหลด
 *
 * `complete` : รวม part (ถ้าเป็น multipart) → ตรวจขนาดและ **magic bytes** ที่ storage จริง
 *              → ตั้งสถานะ READY  (NFR-03 — ไม่เชื่อ Content-Type จาก client)
 * `abort`    : ยกเลิก multipart และลบ Asset ทิ้ง ไม่ให้เหลือ part ค้างกินพื้นที่
 */
export async function POST(request: Request) {
  const actor = await requireUploader();
  if (isFailure(actor)) return actor.response;

  const parsed = completeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400).response;
  }

  const input = parsed.data;
  const asset = await findOwnPendingAsset(input.assetId, actor.id);
  if (!asset) return jsonError("ไม่พบไฟล์ที่กำลังอัปโหลด", 404).response;

  if (input.action === "abort") {
    if (input.uploadId) {
      await abortMultipart(asset.key, input.uploadId).catch(() => {});
    }
    await db.asset.delete({ where: { id: asset.id } });
    return NextResponse.json({ ok: true, message: "ยกเลิกการอัปโหลดแล้ว" });
  }

  if (input.uploadId) {
    if (!input.parts?.length) {
      return jsonError("ไม่พบรายการ part ของไฟล์", 400).response;
    }
    try {
      await completeMultipart(asset.key, input.uploadId, input.parts);
    } catch {
      await abortMultipart(asset.key, input.uploadId).catch(() => {});
      await db.asset.update({ where: { id: asset.id }, data: { status: "FAILED" } });
      return jsonError("รวมไฟล์ที่อัปโหลดไม่สำเร็จ กรุณาอัปโหลดใหม่", 400).response;
    }
  }

  // ขนาดจริงที่ storage เท่านั้นที่เชื่อถือได้ — ค่าที่ client แจ้งตอน presign เป็นแค่การกรองชั้นแรก
  const stat = await statObject(asset.key);
  if (!stat) return rejectAsset(asset.id, asset.key, "ไม่พบไฟล์ที่อัปโหลดใน storage");

  const sizeCheck = checkUpload(asset.kind, asset.mime, stat.size);
  if (!sizeCheck.ok) return rejectAsset(asset.id, asset.key, sizeCheck.message);

  const head = await readHead(asset.key);
  if (!head || !mimeMatchesContent(asset.mime, head)) {
    return rejectAsset(
      asset.id,
      asset.key,
      "เนื้อไฟล์ไม่ตรงกับชนิดที่แจ้ง ระบบจึงไม่รับไฟล์นี้",
    );
  }

  const ready = await db.asset.update({
    where: { id: asset.id },
    data: { status: "READY", size: BigInt(stat.size) },
    select: { id: true, kind: true, mime: true, originalName: true },
  });

  await writeAudit({
    actorId: actor.id,
    action: "asset.upload",
    entity: "Asset",
    entityId: ready.id,
    after: { kind: ready.kind, mime: ready.mime, size: stat.size, originalName: ready.originalName },
  });

  return NextResponse.json({
    ok: true,
    asset: { ...ready, size: stat.size, sizeLabel: formatBytes(stat.size) },
  });
}
