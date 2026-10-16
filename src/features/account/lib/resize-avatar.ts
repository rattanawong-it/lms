import { AVATAR_PX, AVATAR_SOURCE_MIMES } from "@/features/account/lib/avatar";
import { AVATAR_MAX_SIZE, AVATAR_SOURCE_MAX_SIZE } from "@/lib/upload-limits";
import { UploadError } from "@/features/uploads/lib/upload-client";

/** ช่วงของรูปต้นฉบับที่ครอปมาเป็นสี่เหลี่ยมจัตุรัสกึ่งกลาง — แยกเป็นฟังก์ชันล้วนเพื่อทดสอบ */
export function centerSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * FR-01.5 — ครอปกึ่งกลาง + ย่อเป็น 512×512 ก่อนอัปโหลด (system-design §5.9)
 * เบราว์เซอร์ที่เข้ารหัส WebP ไม่ได้ (Safari รุ่นเก่า) จะได้ PNG กลับมาจาก `toBlob` — ใช้ JPEG แทน
 * การวาดลง canvas ใหม่ทิ้งข้อมูล EXIF (พิกัด GPS ฯลฯ) ของรูปต้นฉบับไปด้วย
 */
export async function resizeAvatar(file: File): Promise<File> {
  if (!(AVATAR_SOURCE_MIMES as readonly string[]).includes(file.type)) {
    throw new UploadError("รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP");
  }
  if (file.size > AVATAR_SOURCE_MAX_SIZE) {
    throw new UploadError("ไฟล์รูปต้องมีขนาดไม่เกิน 20 MB");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UploadError("เปิดไฟล์รูปนี้ไม่ได้ กรุณาเลือกรูปอื่น");
  }

  const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_PX, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new UploadError("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  // พื้นขาวรองรูป PNG โปร่งใส เผื่อต้องตกไปใช้ JPEG
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.88);
  if (!blob) throw new UploadError("ย่อรูปไม่สำเร็จ กรุณาลองใหม่");
  if (blob.size > AVATAR_MAX_SIZE) throw new UploadError("รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น");

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `avatar.${ext}`, { type: blob.type });
}
