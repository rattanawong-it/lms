import { EnrollmentStatus, SubmissionStatus } from "@/generated/prisma/enums";
import { latestPerStudent } from "@/features/assignments/lib/rules";

/**
 * FR-12.3 · NFR-05 — กติกาของงานตามเวลา (pure ทั้งไฟล์ — route handler และ unit test ใช้ร่วมกัน)
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** แจ้งงานที่ครบกำหนดภายในกี่ ms ข้างหน้า */
export const DUE_SOON_WINDOW_MS = 24 * HOUR_MS;
/** แจ้งคาบเรียนสดที่เริ่มภายในกี่ ms ข้างหน้า */
export const LIVE_SOON_WINDOW_MS = 1 * HOUR_MS;

/** NFR-05 — เก็บ log การใช้งาน/หน้าจอไว้ 1 ปี */
export const LOG_RETENTION_MS = 365 * DAY_MS;
/** การแจ้งเตือนที่อ่านแล้วเก็บไว้ 180 วัน (ที่ยังไม่อ่านเก็บตลอด) */
export const READ_NOTIFICATION_RETENTION_MS = 180 * DAY_MS;

/** ช่วงเวลาที่ถือว่า "ใกล้ถึง": หลังตอนนี้ (ไม่รวม) ถึงไม่เกินขอบ (รวม) */
export function soonRange(now: Date, windowMs: number): { gt: Date; lte: Date } {
  return { gt: now, lte: new Date(now.getTime() + windowMs) };
}

export function olderThan(now: Date, ageMs: number): Date {
  return new Date(now.getTime() - ageMs);
}

/**
 * key กันแจ้งซ้ำ — ผูกกับเวลาด้วย: ผู้สอนเลื่อนกำหนดส่ง/เวลาเริ่มแล้วผู้เรียนได้รับแจ้งใหม่ตามเวลาใหม่
 * แต่ cron รอบถัดไปของเวลาเดิมไม่แจ้งซ้ำ
 */
export function dueDedupeKey(assignmentId: string, dueAt: Date): string {
  return `due:${assignmentId}:${dueAt.toISOString()}`;
}

export function liveDedupeKey(lessonId: string, liveStartAt: Date): string {
  return `live:${lessonId}:${liveStartAt.toISOString()}`;
}

type EnrollmentRow = { userId: string; status: EnrollmentStatus; expiresAt: Date | null };

/**
 * ผู้เรียนที่ยังเรียนคอร์สอยู่จริง — `ACTIVE` และยังไม่หมดอายุ
 * (เรียนจบแล้ว/ถอน/รออนุมัติไม่ต้องได้รับแจ้ง · `EXPIRED` ไม่ถูกตั้งอัตโนมัติ จึงเทียบ `expiresAt` เอง)
 */
export function activeLearners(enrollments: readonly EnrollmentRow[], now: Date): string[] {
  return enrollments
    .filter((e) => e.status === EnrollmentStatus.ACTIVE && (e.expiresAt === null || e.expiresAt > now))
    .map((e) => e.userId);
}

type SubmissionRow = { userId: string; attemptNo: number; status: SubmissionStatus };

/**
 * ผู้ที่ยังต้องส่งงาน — ไม่เคยส่ง หรือครั้งล่าสุดถูกส่งกลับให้แก้ (FR-08.4)
 * ส่งแล้วรอตรวจ/ตรวจแล้วไม่ต้องเตือน
 */
export function pendingSubmitters(learnerIds: readonly string[], submissions: readonly SubmissionRow[]): string[] {
  const done = new Set(
    latestPerStudent([...submissions])
      .filter((s) => s.status !== SubmissionStatus.RETURNED)
      .map((s) => s.userId),
  );
  return learnerIds.filter((id) => !done.has(id));
}
