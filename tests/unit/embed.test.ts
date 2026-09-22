import { describe, expect, it } from "vitest";
import { liveWindow, toEmbedUrl } from "@/features/lesson-media/lib/embed";

/** M05 · FR-05.2 / FR-05.5 — ลิงก์ฝังวิดีโอ และช่วงเวลาเปิดห้องเรียนสด */

describe("toEmbedUrl", () => {
  it("รับ YouTube ได้ทุกรูปแบบที่ผู้สอนมักวาง", () => {
    const expected = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(toEmbedUrl(url), url).toContain(expected);
    }
  });

  it("ฝังผ่าน youtube-nocookie และปิดวิดีโอแนะนำท้ายคลิป", () => {
    const embed = toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")!;
    expect(embed.startsWith("https://www.youtube-nocookie.com/")).toBe(true);
    expect(embed).toContain("rel=0");
  });

  it("รับ Vimeo ได้ทั้งลิงก์ปกติ ลิงก์ channel และลิงก์ player", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      "https://www.vimeo.com/channels/staffpicks/123456789",
      "https://player.vimeo.com/video/123456789",
    ]) {
      expect(toEmbedUrl(url), url).toContain("https://player.vimeo.com/video/123456789");
    }
  });

  it("ปฏิเสธโดเมนอื่น ลิงก์เสีย และ scheme อันตราย", () => {
    expect(toEmbedUrl("https://evil.example/video.mp4")).toBeNull();
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(toEmbedUrl("ไม่ใช่ลิงก์")).toBeNull();
    expect(toEmbedUrl(null)).toBeNull();
    expect(toEmbedUrl("")).toBeNull();
  });

  it("ปฏิเสธรหัสวิดีโอที่ผิดรูป ไม่ปล่อยค่าดิบลงไปใน src ของ iframe", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=../../evil")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/watch?v=sh0rt")).toBeNull();
    expect(toEmbedUrl("https://vimeo.com/not-a-number")).toBeNull();
  });
});

describe("liveWindow (FR-05.5)", () => {
  const start = new Date("2026-09-22T03:00:00.000Z");
  const end = new Date("2026-09-22T05:00:00.000Z");

  it("เปิดปุ่มก่อนเวลาเริ่ม 15 นาทีพอดี", () => {
    expect(liveWindow(start, end, new Date("2026-09-22T02:44:00.000Z"))).toBe("before");
    expect(liveWindow(start, end, new Date("2026-09-22T02:45:00.000Z"))).toBe("open");
  });

  it("ระหว่างคาบถือว่าเปิด และหลังเวลาสิ้นสุดถือว่าจบแล้ว", () => {
    expect(liveWindow(start, end, new Date("2026-09-22T04:00:00.000Z"))).toBe("open");
    expect(liveWindow(start, end, new Date("2026-09-22T05:00:01.000Z"))).toBe("ended");
  });

  it("ไม่มีเวลาสิ้นสุดถือว่ายังเปิดอยู่ — ผู้สอนอาจสอนยาวกว่าที่ประกาศ", () => {
    expect(liveWindow(start, null, new Date("2026-09-23T00:00:00.000Z"))).toBe("open");
  });

  it("ไม่ระบุเวลาเริ่มเลยก็เข้าได้ตลอด", () => {
    expect(liveWindow(null, null)).toBe("open");
  });
});
