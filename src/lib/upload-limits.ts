import { AssetKind } from "@/generated/prisma/enums";

/**
 * ขีดจำกัดการอัปโหลดตาม phase-1-plan.md §1
 * ใช้ร่วมกันทั้ง client (แสดงข้อความก่อนเลือกไฟล์) และ server (บังคับจริงก่อนออก presigned URL)
 * ไฟล์นี้ต้องไม่ import อะไรที่เป็น server-only
 */
const MB = 1024 * 1024;
const GB = 1024 * MB;

export type UploadRule = {
  maxSize: number;
  /** MIME ที่ยอมรับ — ตรวจซ้ำด้วย magic bytes หลังอัปโหลดเสร็จ (lib/file-type.ts) */
  mimes: readonly string[];
  label: string;
};

export const UPLOAD_RULES: Record<AssetKind, UploadRule> = {
  // D-04 · Phase 1 เสิร์ฟ MP4 ไฟล์เดียว จึงรับเฉพาะรูปแบบที่เบราว์เซอร์เล่นได้เองโดยไม่ต้อง transcode
  VIDEO: {
    maxSize: 2 * GB,
    mimes: ["video/mp4", "video/webm"],
    label: "วิดีโอ",
  },
  PDF: {
    maxSize: 50 * MB,
    mimes: ["application/pdf"],
    label: "เอกสาร PDF",
  },
  IMAGE: {
    maxSize: 5 * MB,
    mimes: ["image/png", "image/jpeg", "image/webp"],
    label: "รูปภาพ",
  },
  // ไฟล์ประกอบบทเรียน (FR-05.7) — เอกสาร Office, PDF, รูป, ข้อความ และไฟล์บีบอัด
  FILE: {
    maxSize: 25 * MB,
    mimes: [
      "application/pdf",
      "application/zip",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "text/csv",
    ],
    label: "ไฟล์ประกอบ",
  },
};

/** ขนาด part ของ multipart upload — 10 MB ตาม system-design §5.8 */
export const MULTIPART_PART_SIZE = 10 * MB;

/** ไฟล์ที่เล็กกว่านี้อัปโหลดทีเดียวจบ ไม่ต้องใช้ multipart */
export const MULTIPART_THRESHOLD = 20 * MB;

/** แปลงขนาดเป็นข้อความภาษาไทยสำหรับแสดงผลและข้อความ error */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes % GB === 0 ? 0 : 1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type UploadCheck = { ok: true } | { ok: false; message: string };

/** ตรวจ kind/mime/ขนาด ก่อนออก presigned URL — ปฏิเสธไว้ก่อนเป็นค่าตั้งต้น */
export function checkUpload(kind: AssetKind, mime: string, size: number): UploadCheck {
  const rule = UPLOAD_RULES[kind];
  if (!rule) return { ok: false, message: "ประเภทไฟล์ไม่ถูกต้อง" };

  if (!rule.mimes.includes(mime)) {
    return { ok: false, message: `${rule.label} รองรับเฉพาะชนิดไฟล์ ${rule.mimes.join(", ")}` };
  }
  if (!Number.isInteger(size) || size <= 0) {
    return { ok: false, message: "ขนาดไฟล์ไม่ถูกต้อง" };
  }
  if (size > rule.maxSize) {
    return {
      ok: false,
      message: `${rule.label} ต้องไม่เกิน ${formatBytes(rule.maxSize)} (ไฟล์นี้ ${formatBytes(size)})`,
    };
  }
  return { ok: true };
}
