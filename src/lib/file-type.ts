/**
 * NFR-03 — ตรวจชนิดไฟล์จาก magic bytes ไม่เชื่อ `Content-Type` ที่ client ส่งมา
 * ใช้หลังอัปโหลดเสร็จ โดยอ่านเฉพาะ 16 ไบต์แรกของ object (lib/storage.ts → readHead)
 * ไฟล์นี้เป็นฟังก์ชัน pure ทั้งหมด จึงทดสอบได้ตรง ๆ
 */
export const MAGIC_HEAD_BYTES = 16;

type Signature = {
  mime: string;
  offset: number;
  bytes: readonly number[];
  /** ไบต์เพิ่มเติมที่ต้องตรงด้วย (เช่น WEBP ต้องมี "WEBP" ที่ offset 8) */
  also?: { offset: number; bytes: readonly number[] };
};

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const SIGNATURES: readonly Signature[] = [
  { mime: "application/pdf", offset: 0, bytes: ascii("%PDF-") },
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  {
    mime: "image/webp",
    offset: 0,
    bytes: ascii("RIFF"),
    also: { offset: 8, bytes: ascii("WEBP") },
  },
  { mime: "video/mp4", offset: 4, bytes: ascii("ftyp") },
  { mime: "video/webm", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  // เอกสาร Office สมัยใหม่ (docx/xlsx/pptx) คือ ZIP — แยกชนิดย่อยไม่ได้จาก magic bytes
  { mime: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  // เอกสาร Office รุ่นเก่า (doc/xls/ppt) เป็น OLE compound file
  {
    mime: "application/x-ole-storage",
    offset: 0,
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
];

function matchesAt(head: Uint8Array, offset: number, bytes: readonly number[]): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

/** คืน MIME ที่ตรวจได้จริง หรือ null ถ้าไม่รู้จักลายเซ็น */
export function sniffMime(head: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (!matchesAt(head, sig.offset, sig.bytes)) continue;
    if (sig.also && !matchesAt(head, sig.also.offset, sig.also.bytes)) continue;
    return sig.mime;
  }
  return null;
}

/**
 * MIME ที่ client แจ้งมา ถือว่าสอดคล้องกับเนื้อไฟล์จริงหรือไม่
 *
 * ชนิดที่ magic bytes แยกไม่ออก (Office = ZIP, ข้อความล้วน = ไม่มีลายเซ็น)
 * จะเทียบแบบยอมรับกลุ่มแทนการเทียบตรงตัว
 */
const ZIP_BASED = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const OLE_BASED = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

/** ชนิดที่ไม่มีลายเซ็นให้ตรวจ — ยอมรับได้เมื่อ sniff ไม่เจออะไรเลย */
const SIGNATURE_LESS = new Set(["text/plain", "text/csv"]);

export function mimeMatchesContent(declared: string, head: Uint8Array): boolean {
  const detected = sniffMime(head);

  if (detected === null) return SIGNATURE_LESS.has(declared);
  if (detected === declared) return true;
  if (detected === "application/zip") return ZIP_BASED.has(declared);
  if (detected === "application/x-ole-storage") return OLE_BASED.has(declared);

  return false;
}
