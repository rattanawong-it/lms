import { describe, expect, it } from "vitest";
import {
  LESSON_DOCUMENT_KINDS,
  UPLOAD_RULES,
  acceptFor,
  checkUpload,
  formatBytes,
  mimeFromName,
  pickAssetKind,
} from "@/lib/upload-limits";
import { AssetKind } from "@/generated/prisma/enums";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("checkUpload", () => {
  it("ผ่านเมื่อชนิดและขนาดอยู่ในเกณฑ์", () => {
    expect(checkUpload(AssetKind.VIDEO, "video/mp4", 500 * MB)).toEqual({ ok: true });
    expect(checkUpload(AssetKind.PDF, "application/pdf", 10 * MB)).toEqual({ ok: true });
  });

  it("ปฏิเสธไฟล์ที่เกินเพดานของแต่ละชนิด", () => {
    const video = checkUpload(AssetKind.VIDEO, "video/mp4", 3 * GB);
    expect(video.ok).toBe(false);
    expect(video.ok === false && video.message).toContain("2 GB");

    const pdf = checkUpload(AssetKind.PDF, "application/pdf", 80 * MB);
    expect(pdf.ok).toBe(false);
  });

  it("ปฏิเสธชนิดไฟล์ที่ไม่อยู่ใน allowlist", () => {
    // D-04 — เฟสนี้ยังไม่ transcode จึงรับเฉพาะที่เบราว์เซอร์เล่นเองได้
    expect(checkUpload(AssetKind.VIDEO, "video/quicktime", 10 * MB).ok).toBe(false);
    expect(checkUpload(AssetKind.PDF, "application/zip", 1 * MB).ok).toBe(false);
    expect(checkUpload(AssetKind.IMAGE, "image/svg+xml", 1024).ok).toBe(false);
  });

  it("ปฏิเสธขนาดที่ไม่สมเหตุผล", () => {
    expect(checkUpload(AssetKind.PDF, "application/pdf", 0).ok).toBe(false);
    expect(checkUpload(AssetKind.PDF, "application/pdf", -1).ok).toBe(false);
    expect(checkUpload(AssetKind.PDF, "application/pdf", 1.5).ok).toBe(false);
  });

  it("มีกติกาครบทุก AssetKind", () => {
    for (const kind of Object.values(AssetKind)) {
      expect(UPLOAD_RULES[kind]?.mimes.length).toBeGreaterThan(0);
    }
  });
});

describe("formatBytes", () => {
  it("อ่านง่ายในหน่วยที่เหมาะกับขนาด", () => {
    expect(formatBytes(2 * GB)).toBe("2 GB");
    expect(formatBytes(50 * MB)).toBe("50 MB");
    expect(formatBytes(1536)).toBe("2 KB");
  });
});

describe("บทเรียนเอกสาร — PDF หรือไฟล์ Office (FR-05.8)", () => {
  it("MIME มาจากนามสกุล ไม่สนตัวพิมพ์ และไม่รู้จักคืน null", () => {
    expect(mimeFromName("สไลด์บทที่ 1.PPTX")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(mimeFromName("data.csv")).toBe("text/csv");
    expect(mimeFromName("old.doc")).toBe("application/msword");
    expect(mimeFromName("ไม่มีนามสกุล")).toBeNull();
    expect(mimeFromName("run.exe")).toBeNull();
  });

  it("PDF ไปตัวอ่านในเว็บ ส่วน Office/รูป/ข้อความเป็นไฟล์ดาวน์โหลด", () => {
    expect(pickAssetKind(LESSON_DOCUMENT_KINDS, "application/pdf")).toBe(AssetKind.PDF);
    for (const name of ["a.docx", "a.xls", "a.pptx", "a.png", "a.txt", "a.csv"]) {
      expect(pickAssetKind(LESSON_DOCUMENT_KINDS, mimeFromName(name)!)).toBe(AssetKind.FILE);
    }
    expect(pickAssetKind(LESSON_DOCUMENT_KINDS, "video/mp4")).toBeNull();
  });

  it("accept ของช่องเลือกไฟล์มีทั้ง MIME และนามสกุล", () => {
    const accept = acceptFor(LESSON_DOCUMENT_KINDS).split(",");
    expect(accept).toContain("application/pdf");
    expect(accept).toContain(".pptx");
    expect(accept).toContain(".xlsx");
    expect(accept).not.toContain(".mp4");
  });

  it("เพดานขนาดตามชนิดที่ถูกเลือก — PDF 50 MB · ไฟล์อื่น 25 MB", () => {
    const docx = mimeFromName("a.docx")!;
    expect(checkUpload(AssetKind.FILE, docx, 30 * MB).ok).toBe(false);
    expect(checkUpload(AssetKind.PDF, "application/pdf", 30 * MB).ok).toBe(true);
    expect(UPLOAD_RULES.FILE.maxSize).toBe(25 * MB);
  });
});
