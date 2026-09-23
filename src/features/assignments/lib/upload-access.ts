import "server-only";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/roles";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { submissionFileError, submissionMime, submitState } from "@/features/assignments/lib/rules";

/** อัปโหลดไฟล์ส่งงานได้ไม่เกิน 30 ไฟล์ต่อ 10 นาทีต่อคน — กันการยัดไฟล์ขยะเข้าระบบ */
const UPLOAD_QUOTA = { windowSec: 600, max: 30 };

export type SubmissionUploadCheck = { ok: true } | { ok: false; status: number; message: string };

/**
 * M08 · phase-2-plan ขั้น 4 — ผู้เรียนอัปโหลดได้ **เฉพาะในบริบทของงานที่ตนลงทะเบียนอยู่**
 * ไม่ได้เปิดสิทธิ์อัปโหลดทั่วไปให้ STUDENT
 *
 * ตรวจ: งานผูกกับบทเรียนแล้ว · ลงทะเบียนคอร์สนั้นและยังไม่หมดอายุ · งานยังเปิดรับ
 * · นามสกุล/ขนาดตามที่ผู้สอนกำหนด · MIME ต้องตรงกับนามสกุล · rate limit
 * ไฟล์ถูกตรวจซ้ำอีกรอบตอนกดส่งงาน (`submitAssignment`) เพราะ presign เชื่อขนาดที่ client แจ้ง
 */
export async function authorizeSubmissionUpload(
  user: SessionUser,
  assignmentId: string,
  file: { name: string; mime: string; size: number },
): Promise<SubmissionUploadCheck> {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, courseId: true, lessonId: true, dueAt: true, allowLate: true, allowedTypes: true, maxFileMb: true },
  });
  if (!assignment || !assignment.lessonId) return { ok: false, status: 404, message: "ไม่พบงานที่ต้องส่ง" };

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: assignment.courseId } },
    select: { status: true, expiresAt: true },
  });
  const active =
    (enrollment?.status === EnrollmentStatus.ACTIVE || enrollment?.status === EnrollmentStatus.COMPLETED) &&
    (enrollment.expiresAt === null || enrollment.expiresAt > new Date());
  if (!active) return { ok: false, status: 403, message: "ไม่มีสิทธิ์ส่งงานนี้" };

  const latest = await db.submission.findFirst({
    where: { assignmentId, userId: user.id },
    orderBy: { attemptNo: "desc" },
    select: { status: true, isLate: true },
  });
  const state = submitState(assignment, latest, new Date());
  if (!state.canSubmit) return { ok: false, status: 400, message: state.reason };

  const fileError = submissionFileError(file, assignment);
  if (fileError) return { ok: false, status: 400, message: fileError };
  if (file.mime !== submissionMime(file.name)) return { ok: false, status: 400, message: "ชนิดไฟล์ไม่ตรงกับนามสกุล" };

  if (!rateLimit(`submission-upload:${user.id}`, UPLOAD_QUOTA).ok) {
    return { ok: false, status: 429, message: "อัปโหลดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }
  return { ok: true };
}
