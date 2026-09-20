import { describe, expect, it } from "vitest";
import { buildObjectKey, safeExtension } from "@/lib/object-key";
import { AssetKind } from "@/generated/prisma/enums";

const at = new Date("2026-09-20T00:00:00Z");
const uuid = () => "11111111-2222-3333-4444-555555555555";

describe("safeExtension", () => {
  it("รับนามสกุลปกติและแปลงเป็นตัวพิมพ์เล็ก", () => {
    expect(safeExtension("บทเรียน.MP4")).toBe(".mp4");
    expect(safeExtension("report.pdf")).toBe(".pdf");
  });

  it("ตัดทิ้งเมื่อไม่มีนามสกุลหรือนามสกุลผิดรูป", () => {
    expect(safeExtension("ไม่มีนามสกุล")).toBe("");
    expect(safeExtension("file.")).toBe("");
    expect(safeExtension("file.verylongextension")).toBe("");
    expect(safeExtension("file.tar.gz")).toBe(".gz");
  });

  it("ตัดอักขระอันตรายใน 'นามสกุล' ทิ้ง", () => {
    expect(safeExtension("evil.php%00")).toBe("");
    expect(safeExtension("evil../../etc/passwd")).toBe("");
    expect(safeExtension("evil.p/hp")).toBe("");
  });
});

describe("buildObjectKey", () => {
  it("แยกโฟลเดอร์ตามชนิดและเดือน", () => {
    expect(buildObjectKey(AssetKind.VIDEO, "lesson.mp4", at, uuid)).toBe(
      "video/2026/09/11111111-2222-3333-4444-555555555555.mp4",
    );
    expect(buildObjectKey(AssetKind.PDF, "slide.pdf", at, uuid)).toBe(
      "pdf/2026/09/11111111-2222-3333-4444-555555555555.pdf",
    );
  });

  it("ไม่นำชื่อไฟล์เดิมมาใส่ใน key เลย (กัน path traversal)", () => {
    const key = buildObjectKey(AssetKind.FILE, "../../../etc/passwd", at, uuid);
    expect(key).toBe("file/2026/09/11111111-2222-3333-4444-555555555555");
    expect(key).not.toContain("..");
    expect(key).not.toContain("passwd");
  });

  it("ชื่อไฟล์ภาษาไทยไม่หลุดเข้า key", () => {
    const key = buildObjectKey(AssetKind.VIDEO, "บทที่ 1 แนะนำระบบ.mp4", at, uuid);
    expect(key.endsWith(".mp4")).toBe(true);
    expect(key).not.toContain("บทที่");
  });

  it("key ไม่ซ้ำกันแม้ชื่อไฟล์เดียวกัน", () => {
    const a = buildObjectKey(AssetKind.VIDEO, "same.mp4");
    const b = buildObjectKey(AssetKind.VIDEO, "same.mp4");
    expect(a).not.toBe(b);
  });
});
