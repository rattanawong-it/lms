import { describe, expect, it } from "vitest";
import {
  courseSchema,
  isEmbeddableVideoUrl,
  isHttpUrl,
  lessonSchema,
  parseCompletionRule,
} from "@/features/courses/schemas";
import { EnrollPolicy, LessonType, VideoSource, Visibility } from "@/generated/prisma/enums";

/** จำลองสิ่งที่ action ได้รับจาก FormData — ช่องที่ไม่มีในฟอร์มจะเป็น null ไม่ใช่ undefined */
function formValues(overrides: Record<string, unknown> = {}) {
  return {
    title: "คอร์สทดสอบ",
    slug: "test-course",
    summary: "",
    level: "",
    visibility: Visibility.INTERNAL,
    enrollPolicy: EnrollPolicy.OPEN,
    sequential: false,
    categoryId: "none",
    departmentId: null,
    ...overrides,
  };
}

describe("courseSchema (FR-04.1)", () => {
  it("ยอมรับช่องที่ไม่ปรากฏในฟอร์ม (formData.get คืน null)", () => {
    // ผู้สอนธรรมดาไม่เห็นช่องเลือกคณะ ฟอร์มจึงไม่มี departmentId เลย
    const parsed = courseSchema.safeParse(formValues());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.departmentId).toBeNull();
    expect(parsed.success && parsed.data.summary).toBeNull();
  });

  it('ตีค่า "none" ของช่องเลือกเป็นไม่ระบุ', () => {
    const parsed = courseSchema.parse(formValues({ categoryId: "none", departmentId: "none" }));
    expect(parsed.categoryId).toBeNull();
    expect(parsed.departmentId).toBeNull();
  });

  it("บังคับรูปแบบ slug", () => {
    expect(courseSchema.safeParse(formValues({ slug: "Course Slug" })).success).toBe(false);
    expect(courseSchema.safeParse(formValues({ slug: "course-slug-2" })).success).toBe(true);
  });

  it("ปฏิเสธชื่อคอร์สที่สั้นเกินไป", () => {
    const parsed = courseSchema.safeParse(formValues({ title: "ก" }));
    expect(parsed.success).toBe(false);
  });
});

describe("lessonSchema (FR-04.3)", () => {
  const base = {
    sectionId: "clh0000000000000000000000",
    title: "บทเรียนทดสอบ",
    isPreview: false,
  };

  /** รหัส Asset ที่อัปโหลดเสร็จแล้ว — ของจริงตรวจอีกชั้นในฝั่ง action */
  const ASSET_ID = "clh1111111111111111111111";

  it("วิดีโอต้องมีลิงก์ที่ฝังได้", () => {
    const ok = lessonSchema.safeParse({
      ...base,
      type: LessonType.VIDEO,
      videoSource: VideoSource.YOUTUBE,
      videoUrl: "https://www.youtube.com/watch?v=abc",
    });
    expect(ok.success).toBe(true);

    const bad = lessonSchema.safeParse({
      ...base,
      type: LessonType.VIDEO,
      videoSource: VideoSource.YOUTUBE,
      videoUrl: "https://evil.example/video.mp4",
    });
    expect(bad.success).toBe(false);
  });

  it("วิดีโอแบบอัปโหลดเองต้องมีไฟล์ ไม่ใช่ลิงก์ (FR-05.1)", () => {
    const withoutFile = lessonSchema.safeParse({
      ...base,
      type: LessonType.VIDEO,
      videoSource: VideoSource.UPLOAD,
    });
    expect(withoutFile.success).toBe(false);

    const withFile = lessonSchema.safeParse({
      ...base,
      type: LessonType.VIDEO,
      videoSource: VideoSource.UPLOAD,
      assetId: ASSET_ID,
    });
    expect(withFile.success).toBe(true);
  });

  it("เอกสารต้องมีไฟล์ PDF ที่อัปโหลดแล้ว (FR-05.1)", () => {
    expect(lessonSchema.safeParse({ ...base, type: LessonType.PDF }).success).toBe(false);
    expect(
      lessonSchema.safeParse({ ...base, type: LessonType.PDF, assetId: ASSET_ID }).success,
    ).toBe(true);
  });

  it("ลิงก์วิดีโอย้อนหลังของคาบเรียนสดต้องเป็น http/https (FR-05.5)", () => {
    const live = {
      ...base,
      type: LessonType.LIVE,
      liveUrl: "https://meet.google.com/abc-defg-hij",
      liveStartAt: "2026-10-01T09:00",
    };
    expect(lessonSchema.safeParse({ ...live, recordingUrl: "https://ex.test/v" }).success).toBe(
      true,
    );
    expect(lessonSchema.safeParse({ ...live, recordingUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("บทเรียนสดต้องมีลิงก์และเวลาเริ่ม", () => {
    expect(lessonSchema.safeParse({ ...base, type: LessonType.LIVE }).success).toBe(false);

    const ok = lessonSchema.safeParse({
      ...base,
      type: LessonType.LIVE,
      liveUrl: "https://meet.google.com/abc-defg-hij",
      liveStartAt: "2026-10-01T09:00",
    });
    expect(ok.success).toBe(true);
  });

  it("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม", () => {
    const parsed = lessonSchema.safeParse({
      ...base,
      type: LessonType.LIVE,
      liveUrl: "https://meet.google.com/abc-defg-hij",
      liveStartAt: "2026-10-01T09:00",
      liveEndAt: "2026-10-01T08:00",
    });
    expect(parsed.success).toBe(false);
  });

  it("บทความและเอกสารไม่ต้องกรอกช่องของวิดีโอ (ค่าที่ส่งมาเป็น null)", () => {
    for (const type of [LessonType.TEXT, LessonType.QUIZ, LessonType.ASSIGNMENT]) {
      const parsed = lessonSchema.safeParse({
        ...base,
        type,
        videoSource: null,
        videoUrl: null,
        durationSec: null,
        liveUrl: null,
        liveStartAt: null,
        liveEndAt: null,
      });
      expect(parsed.success, `ชนิด ${type}`).toBe(true);
    }
  });
});

describe("ตัวตรวจลิงก์", () => {
  it("รับเฉพาะ http/https", () => {
    expect(isHttpUrl("https://meet.google.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("ไม่ใช่ URL")).toBe(false);
  });

  it("ฝังได้เฉพาะ YouTube และ Vimeo", () => {
    expect(isEmbeddableVideoUrl("https://youtu.be/abc")).toBe(true);
    expect(isEmbeddableVideoUrl("https://player.vimeo.com/video/1")).toBe(true);
    expect(isEmbeddableVideoUrl("https://youtube.com.evil.example/x")).toBe(false);
    expect(isEmbeddableVideoUrl("https://cdn.example/video.mp4")).toBe(false);
  });
});

describe("parseCompletionRule (FR-04.7)", () => {
  it("อ่านค่าที่ถูกต้องได้ตรง", () => {
    expect(parseCompletionRule({ minProgress: 80, requireQuizPass: true, minScore: 60 })).toEqual({
      minProgress: 80,
      requireQuizPass: true,
      minScore: 60,
    });
  });

  it("ข้อมูลเก่าหรือเสียกลับไปใช้ค่าตั้งต้นแทนการ throw", () => {
    expect(parseCompletionRule(null).minProgress).toBe(100);
    expect(parseCompletionRule({ minProgress: 999 }).minProgress).toBe(100);
    expect(parseCompletionRule("ขยะ").minProgress).toBe(100);
  });
});
