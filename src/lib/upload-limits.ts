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

/**
 * บทเรียนชนิดเอกสาร (`LessonType.PDF`) รับไฟล์ได้สองกลุ่ม (CHANGELOG #48)
 * - PDF → Asset `PDF` แสดงใน pdf.js แบบอ่านอย่างเดียว (FR-05.3)
 * - Word/Excel/PowerPoint/รูป/ข้อความ/ZIP → Asset `FILE` ผู้เรียนดาวน์โหลดไฟล์ต้นฉบับ (FR-05.8)
 * ลำดับสำคัญ: PDF ต้องมาก่อน FILE เพราะ FILE ก็รับ `application/pdf` ด้วย
 */
export const LESSON_DOCUMENT_KINDS = [AssetKind.PDF, AssetKind.FILE] as const;

/**
 * MIME จากนามสกุลไฟล์ — ใช้แทน `file.type` ที่เบราว์เซอร์เดา
 * (Windows รายงาน .csv เป็น `application/vnd.ms-excel` และบางเครื่องไม่รู้จัก .docx เลย)
 * เนื้อไฟล์จริงถูกตรวจซ้ำด้วย magic bytes ตอนอัปโหลดเสร็จเหมือนเดิม
 */
const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
};

export function mimeFromName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_MIME[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** ชนิด Asset ตัวแรกในรายการที่รับ MIME นี้ — ไม่มีชนิดไหนรับคืน null */
export function pickAssetKind(kinds: readonly AssetKind[], mime: string): AssetKind | null {
  return kinds.find((kind) => UPLOAD_RULES[kind].mimes.includes(mime)) ?? null;
}

/** นามสกุลที่ใช้ใน `accept` ของ input — ใส่คู่กับ MIME เพราะบางเครื่องไม่รู้จัก MIME ของ Office */
export function acceptFor(kinds: readonly AssetKind[]): string {
  const mimes = new Set(kinds.flatMap((kind) => UPLOAD_RULES[kind].mimes));
  const extensions = Object.entries(EXTENSION_MIME)
    .filter(([, mime]) => mimes.has(mime))
    .map(([ext]) => `.${ext}`);
  return [...mimes, ...extensions].join(",");
}

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
