import { EnrollmentStatus } from "@/generated/prisma/enums";
import { REVIEW_MIN_PROGRESS } from "@/features/reviews/schemas";

/** M14 · FR-14.1–14.2 — กติการีวิว (pure — ใช้ทั้ง server หน้าจอ และ unit test) */

export type ReviewEligibility =
  | { ok: true }
  | { ok: false; reason: "not-enrolled" | "progress"; progressPct: number };

/**
 * FR-14.1 — รีวิวได้เมื่อเคยลงทะเบียนจริง (ไม่นับรออนุมัติ/ถอนแล้ว) และเรียนไปแล้ว ≥ 30%
 * สิทธิ์เรียนหมดอายุแล้วยังรีวิวได้ — ได้เรียนไปแล้วจริง
 */
export function reviewEligibility(
  enrollment: { status: EnrollmentStatus; progressPct: number } | null,
): ReviewEligibility {
  const studied =
    enrollment !== null &&
    (enrollment.status === EnrollmentStatus.ACTIVE ||
      enrollment.status === EnrollmentStatus.COMPLETED ||
      enrollment.status === EnrollmentStatus.EXPIRED);
  if (!studied) return { ok: false, reason: "not-enrolled", progressPct: 0 };
  if (enrollment.progressPct < REVIEW_MIN_PROGRESS) {
    return { ok: false, reason: "progress", progressPct: enrollment.progressPct };
  }
  return { ok: true };
}

export type RatingSummary = {
  /** ปัด 2 ตำแหน่ง (ตรงกับ `Course.ratingAvg Decimal(3,2)`) · null เมื่อไม่มีรีวิว */
  avg: number | null;
  count: number;
  /** จำนวนรีวิวต่อดาว เรียง 5 → 1 */
  distribution: { stars: 5 | 4 | 3 | 2 | 1; count: number; pct: number }[];
};

/** FR-14.2 — ค่าเฉลี่ยและการกระจายจากดาวของรีวิวที่ไม่ถูกซ่อน */
export function summarizeRatings(ratings: readonly number[]): RatingSummary {
  const valid = ratings.filter((r) => Number.isInteger(r) && r >= 1 && r <= 5);
  const count = valid.length;
  const sum = valid.reduce((a, b) => a + b, 0);
  const stars = [5, 4, 3, 2, 1] as const;
  return {
    avg: count === 0 ? null : Math.round((sum / count) * 100) / 100,
    count,
    distribution: stars.map((s) => {
      const n = valid.filter((r) => r === s).length;
      return { stars: s, count: n, pct: count === 0 ? 0 : Math.round((n / count) * 100) };
    }),
  };
}

/** Q6 — ชื่อที่แสดงต่อสาธารณะ: ชื่อ + อักษรแรกของนามสกุล ("สมชาย ใ.") · ชื่อคำเดียวแสดงตามเดิม */
export function publicReviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ผู้เรียน";
  if (parts.length === 1) return parts[0]!;
  const last = Array.from(parts[parts.length - 1]!)[0]!;
  return `${parts[0]} ${last}.`;
}
