import { describe, expect, it } from "vitest";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { publicReviewerName, reviewEligibility, summarizeRatings } from "@/features/reviews/lib/rules";
import { replyReviewSchema, upsertReviewSchema } from "@/features/reviews/schemas";

/** M14 · FR-14.1–14.3 — กติการีวิว */

const COURSE = "ckabcdefghijklmnopqrstuvw";

describe("เงื่อนไขการรีวิว (FR-14.1)", () => {
  it("ต้องเรียนไปแล้วอย่างน้อย 30%", () => {
    expect(reviewEligibility({ status: EnrollmentStatus.ACTIVE, progressPct: 29 })).toEqual({ ok: false, reason: "progress", progressPct: 29 });
    expect(reviewEligibility({ status: EnrollmentStatus.ACTIVE, progressPct: 30 })).toEqual({ ok: true });
    expect(reviewEligibility({ status: EnrollmentStatus.COMPLETED, progressPct: 100 })).toEqual({ ok: true });
    expect(reviewEligibility({ status: EnrollmentStatus.EXPIRED, progressPct: 60 })).toEqual({ ok: true });
  });

  it("ไม่ได้ลงทะเบียน / รออนุมัติ / ถอนแล้ว รีวิวไม่ได้", () => {
    expect(reviewEligibility(null).ok).toBe(false);
    expect(reviewEligibility({ status: EnrollmentStatus.PENDING, progressPct: 100 })).toMatchObject({ ok: false, reason: "not-enrolled" });
    expect(reviewEligibility({ status: EnrollmentStatus.DROPPED, progressPct: 100 })).toMatchObject({ ok: false, reason: "not-enrolled" });
  });
});

describe("ค่าเฉลี่ยและการกระจาย (FR-14.2)", () => {
  it("เฉลี่ยปัด 2 ตำแหน่ง · เรียง 5 → 1 ดาว", () => {
    const s = summarizeRatings([5, 4, 4, 1]);
    expect(s.avg).toBe(3.5);
    expect(s.count).toBe(4);
    expect(s.distribution).toEqual([
      { stars: 5, count: 1, pct: 25 },
      { stars: 4, count: 2, pct: 50 },
      { stars: 3, count: 0, pct: 0 },
      { stars: 2, count: 0, pct: 0 },
      { stars: 1, count: 1, pct: 25 },
    ]);
    expect(summarizeRatings([5, 4, 4]).avg).toBe(4.33);
  });

  it("ไม่มีรีวิว → ไม่มีค่าเฉลี่ย · ค่านอกช่วงไม่นับ", () => {
    expect(summarizeRatings([])).toMatchObject({ avg: null, count: 0 });
    expect(summarizeRatings([0, 6, 2.5, 3]).count).toBe(1);
  });
});

describe("ชื่อผู้รีวิว (Q6)", () => {
  it("ชื่อ + อักษรแรกของนามสกุล", () => {
    expect(publicReviewerName("สมชาย ใจดี")).toBe("สมชาย ใ.");
    expect(publicReviewerName("  Somchai   Jaidee ")).toBe("Somchai J.");
    expect(publicReviewerName("สมชาย ณ อยุธยา")).toBe("สมชาย อ.");
    expect(publicReviewerName("สมชาย")).toBe("สมชาย");
    expect(publicReviewerName("   ")).toBe("ผู้เรียน");
  });
});

describe("ฟอร์มรีวิว", () => {
  it("ต้องเลือกดาว 1–5 · ความคิดเห็นว่างเก็บเป็น null", () => {
    const missing = upsertReviewSchema.safeParse({ courseId: COURSE, rating: null, comment: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0]!.message).toBe("กรุณาเลือกจำนวนดาว 1–5");
    expect(upsertReviewSchema.safeParse({ courseId: COURSE, rating: "6" }).success).toBe(false);
    const ok = upsertReviewSchema.safeParse({ courseId: COURSE, rating: "4", comment: "  ดี  " });
    expect(ok.success && ok.data).toEqual({ courseId: COURSE, rating: 4, comment: "ดี" });
    const blank = upsertReviewSchema.safeParse({ courseId: COURSE, rating: "4", comment: "   " });
    expect(blank.success && blank.data.comment).toBeNull();
  });

  it("ตอบกลับว่าง = ลบคำตอบกลับ", () => {
    const r = replyReviewSchema.safeParse({ id: COURSE, reply: "  " });
    expect(r.success && r.data.reply).toBe("");
  });
});
