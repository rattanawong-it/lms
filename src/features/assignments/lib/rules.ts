import { SubmissionStatus } from "@/generated/prisma/enums";
import { SUBMISSION_FILE_TYPES, type SubmissionFileType } from "@/features/assignments/schemas";

/**
 * M08 · FR-08.2 / FR-08.3 / FR-08.4 — กติกาการส่งงาน (pure function — ใช้ทั้งหน้าจอและ action)
 *
 *   ยังไม่เคยส่ง     — ส่งได้ · เลยกำหนดแล้วส่งได้เมื่อผู้สอนเปิดรับงานช้า (ติดป้าย "ส่งช้า")
 *   ส่งแล้วรอตรวจ   — ส่งใหม่ได้จนถึงกำหนดส่ง (เพิ่ม attemptNo ไม่ทับของเดิม)
 *   ส่งกลับให้แก้    — ส่งใหม่ได้แม้เลยกำหนด · ความ "ส่งช้า" ตามงานที่ถูกส่งกลับ ไม่ใช่วันที่แก้เสร็จ
 *   ตรวจแล้ว        — ปิด ส่งใหม่ไม่ได้
 */

export type DueRule = { dueAt: Date | null; allowLate: boolean };
export type LatestSubmission = { status: SubmissionStatus; isLate: boolean } | null;

export type SubmitState =
  | { canSubmit: true; resubmit: boolean; late: boolean }
  | { canSubmit: false; reason: string };

/** FR-08.3 — ส่งช้าเมื่อเวลาที่ส่งเลยกำหนด (ไม่มีกำหนด = ไม่ช้า) */
export function isPastDue(dueAt: Date | null, at: Date): boolean {
  return dueAt !== null && at.getTime() > dueAt.getTime();
}

export function submitState(rule: DueRule, latest: LatestSubmission, now: Date): SubmitState {
  const pastDue = isPastDue(rule.dueAt, now);

  if (!latest) {
    if (pastDue && !rule.allowLate) return { canSubmit: false, reason: "เลยกำหนดส่งแล้ว และงานนี้ไม่รับงานส่งช้า" };
    return { canSubmit: true, resubmit: false, late: pastDue };
  }

  switch (latest.status) {
    case SubmissionStatus.GRADED:
      return { canSubmit: false, reason: "ผู้สอนตรวจงานนี้แล้ว" };
    case SubmissionStatus.RETURNED:
      return { canSubmit: true, resubmit: true, late: latest.isLate };
    case SubmissionStatus.SUBMITTED:
      if (pastDue) return { canSubmit: false, reason: "เลยกำหนดส่งแล้ว แก้ไขงานที่ส่งไม่ได้" };
      return { canSubmit: true, resubmit: true, late: false };
  }
}

/** นามสกุลไฟล์ตัวพิมพ์เล็ก ไม่มีจุด — ไม่มีนามสกุลคืนสตริงว่าง */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * MIME ที่ใช้กับไฟล์ส่งงาน — ตัดสินจากนามสกุลที่ผู้สอนอนุญาต ไม่ใช้ค่าที่เบราว์เซอร์เดา
 * (Windows มักรายงาน .zip เป็น `application/x-zip-compressed` และบางเครื่องไม่รู้จัก .docx เลย)
 * เนื้อไฟล์จริงถูกตรวจซ้ำด้วย magic bytes ตอนอัปโหลดเสร็จเหมือนไฟล์อื่นทุกชนิด
 */
export function submissionMime(name: string): string | null {
  const ext = extensionOf(name);
  return ext in SUBMISSION_FILE_TYPES ? SUBMISSION_FILE_TYPES[ext as SubmissionFileType] : null;
}

export type FileRule = { allowedTypes: string[]; maxFileMb: number };

/** ตรวจไฟล์หนึ่งไฟล์กับกติกาของงาน — คืนข้อความภาษาไทยเมื่อไม่ผ่าน */
export function submissionFileError(file: { name: string; size: number }, rule: FileRule): string | null {
  const ext = extensionOf(file.name);
  if (!rule.allowedTypes.includes(ext) || !submissionMime(file.name)) {
    return `งานนี้รับเฉพาะไฟล์ ${rule.allowedTypes.map((t) => `.${t}`).join(", ")}`;
  }
  if (file.size > rule.maxFileMb * 1024 * 1024) {
    return `ไฟล์ต้องไม่เกิน ${rule.maxFileMb} MB`;
  }
  return null;
}

/** ส่งล่าสุดของผู้เรียนแต่ละคน — ครั้งก่อน ๆ เป็นประวัติ ไม่ต้องตรวจ */
export function latestPerStudent<T extends { userId: string; attemptNo: number }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.userId);
    if (!current || row.attemptNo > current.attemptNo) latest.set(row.userId, row);
  }
  return [...latest.values()];
}

export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, { label: string; tone: string }> = {
  [SubmissionStatus.SUBMITTED]: { label: "รอตรวจ", tone: "bg-warning-bg text-warning-fg" },
  [SubmissionStatus.GRADED]: { label: "ตรวจแล้ว", tone: "bg-success-bg text-success-fg" },
  [SubmissionStatus.RETURNED]: { label: "ส่งกลับให้แก้", tone: "bg-info-bg text-info-fg" },
};

/** คะแนนที่ผู้สอนให้ได้: 0 ถึงคะแนนเต็มของงาน ละเอียดไม่เกิน 2 ตำแหน่ง */
export function gradeScoreError(score: number, maxScore: number): string | null {
  if (!Number.isFinite(score) || score < 0) return "คะแนนต้องไม่ติดลบ";
  if (score > maxScore) return `งานนี้ได้เต็ม ${maxScore} คะแนน`;
  if (Math.abs(score * 100 - Math.round(score * 100)) > 1e-6) return "คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง";
  return null;
}
