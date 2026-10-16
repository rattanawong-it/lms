/**
 * FR-01.5 รูปโปรไฟล์ — กติกาที่ใช้ทั้ง server และ client (system-design §5.9)
 *
 * `User.image` เก็บได้ 2 แบบ: URL ของ Google (ตั้งโดย Better Auth ตอนสมัคร) หรือ `/api/media/<assetId>`
 * ที่ผู้ใช้อัปโหลดเอง — แบบหลังเท่านั้นที่ระบบเป็นเจ้าของไฟล์และต้องลบเมื่อเปลี่ยน/ลบรูป
 */

/** ด้านของรูปสี่เหลี่ยมจัตุรัสที่เบราว์เซอร์ย่อก่อนอัปโหลด */
export const AVATAR_PX = 512;

/** ชนิดไฟล์ต้นฉบับที่ให้เลือก — ตรงกับที่ `<canvas>` เปิดได้ทุกเบราว์เซอร์ */
export const AVATAR_SOURCE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

const MEDIA_PREFIX = "/api/media/";

export function avatarUrl(assetId: string): string {
  return MEDIA_PREFIX + assetId;
}

/** id ของ Asset ถ้าเป็นรูปที่อัปโหลดในระบบ · URL ภายนอก (Google) หรือค่าแปลก ๆ คืน null */
export function avatarAssetId(image: string | null | undefined): string | null {
  if (!image?.startsWith(MEDIA_PREFIX)) return null;
  const id = image.slice(MEDIA_PREFIX.length);
  return /^[a-z0-9]{20,40}$/.test(id) ? id : null;
}
