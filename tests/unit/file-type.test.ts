import { describe, expect, it } from "vitest";
import { mimeMatchesContent, sniffMime } from "@/lib/file-type";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

function head(...chunks: Uint8Array[]) {
  const out = new Uint8Array(16);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const PDF = head(ascii("%PDF-1.7"));
const PNG = head(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPEG = head(bytes(0xff, 0xd8, 0xff, 0xe0));
const WEBP = head(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WEBP"));
const MP4 = head(bytes(0, 0, 0, 0x20), ascii("ftypisom"));
const WEBM = head(bytes(0x1a, 0x45, 0xdf, 0xa3));
const ZIP = head(bytes(0x50, 0x4b, 0x03, 0x04));
const OLE = head(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1));
const PLAIN = head(ascii("ชื่อ,อีเมล"));

describe("sniffMime", () => {
  it("อ่านลายเซ็นของแต่ละชนิดได้ถูกต้อง", () => {
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(WEBP)).toBe("image/webp");
    expect(sniffMime(MP4)).toBe("video/mp4");
    expect(sniffMime(WEBM)).toBe("video/webm");
    expect(sniffMime(ZIP)).toBe("application/zip");
  });

  it("ไม่สับสน RIFF ที่ไม่ใช่ WEBP (เช่น WAV)", () => {
    const wav = head(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WAVE"));
    expect(sniffMime(wav)).toBeNull();
  });

  it("คืน null เมื่อไม่มีลายเซ็นที่รู้จัก", () => {
    expect(sniffMime(PLAIN)).toBeNull();
    expect(sniffMime(new Uint8Array(0))).toBeNull();
  });
});

describe("mimeMatchesContent (NFR-03 ไม่เชื่อ Content-Type จาก client)", () => {
  it("ผ่านเมื่อชนิดตรงกับเนื้อไฟล์จริง", () => {
    expect(mimeMatchesContent("application/pdf", PDF)).toBe(true);
    expect(mimeMatchesContent("video/mp4", MP4)).toBe(true);
    expect(mimeMatchesContent("image/png", PNG)).toBe(true);
  });

  it("ปฏิเสธไฟล์ที่ปลอมชนิด — .exe เปลี่ยนนามสกุลเป็น mp4", () => {
    const exe = head(ascii("MZ"), bytes(0x90, 0x00));
    expect(mimeMatchesContent("video/mp4", exe)).toBe(false);
  });

  it("ปฏิเสธเมื่อสลับชนิดกันเอง (PDF แจ้งว่าเป็นวิดีโอ)", () => {
    expect(mimeMatchesContent("video/mp4", PDF)).toBe(false);
    expect(mimeMatchesContent("application/pdf", MP4)).toBe(false);
  });

  it("ยอมรับ Office สมัยใหม่ที่เป็น ZIP ข้างใน", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    expect(mimeMatchesContent(docx, ZIP)).toBe(true);
    expect(mimeMatchesContent(xlsx, ZIP)).toBe(true);
    // แต่ ZIP ต้องไม่ผ่านเป็นวิดีโอ
    expect(mimeMatchesContent("video/mp4", ZIP)).toBe(false);
  });

  it("ยอมรับ Office รุ่นเก่าที่เป็น OLE compound file", () => {
    expect(mimeMatchesContent("application/msword", OLE)).toBe(true);
    expect(mimeMatchesContent("application/pdf", OLE)).toBe(false);
  });

  it("ยอมรับไฟล์ข้อความที่ไม่มีลายเซ็น แต่เฉพาะชนิดข้อความเท่านั้น", () => {
    expect(mimeMatchesContent("text/csv", PLAIN)).toBe(true);
    expect(mimeMatchesContent("text/plain", PLAIN)).toBe(true);
    expect(mimeMatchesContent("application/pdf", PLAIN)).toBe(false);
  });
});
