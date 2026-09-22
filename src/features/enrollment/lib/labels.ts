import { EnrollPolicy, EnrollmentSource, EnrollmentStatus } from "@/generated/prisma/enums";

/** M06 — ข้อความภาษาไทยของสถานะการลงทะเบียน (client ใช้ได้ ไม่มี server-only) */

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.PENDING]: "รออนุมัติ",
  [EnrollmentStatus.ACTIVE]: "กำลังเรียน",
  [EnrollmentStatus.COMPLETED]: "เรียนจบแล้ว",
  [EnrollmentStatus.EXPIRED]: "หมดอายุ",
  [EnrollmentStatus.DROPPED]: "ถอนแล้ว",
};

/** คลาสสีของ Badge ตามชุดสีใน globals.css */
export const ENROLLMENT_STATUS_TONE: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.PENDING]: "bg-warning-bg text-warning-fg",
  [EnrollmentStatus.ACTIVE]: "bg-accent text-accent-foreground",
  [EnrollmentStatus.COMPLETED]: "bg-success-bg text-success-fg",
  [EnrollmentStatus.EXPIRED]: "bg-muted text-fg-3",
  [EnrollmentStatus.DROPPED]: "bg-muted text-fg-3",
};

export const ENROLLMENT_SOURCE_LABEL: Record<EnrollmentSource, string> = {
  [EnrollmentSource.SELF]: "สมัครเอง",
  [EnrollmentSource.ADMIN]: "ผู้ดูแลเพิ่มให้",
  [EnrollmentSource.IMPORT]: "นำเข้าเป็นกลุ่ม",
  [EnrollmentSource.PURCHASE]: "ซื้อคอร์ส",
};

export const ENROLL_POLICY_LABEL: Record<EnrollPolicy, string> = {
  [EnrollPolicy.OPEN]: "สมัครเองได้ทันที",
  [EnrollPolicy.APPROVAL]: "ต้องได้รับอนุมัติ",
  [EnrollPolicy.INVITE_ONLY]: "เฉพาะผู้ได้รับเชิญ",
};

/** คำอธิบายใต้ปุ่มลงทะเบียนบนหน้ารายละเอียดคอร์ส */
export const ENROLL_POLICY_HINT: Record<EnrollPolicy, string> = {
  [EnrollPolicy.OPEN]: "ลงทะเบียนแล้วเริ่มเรียนได้ทันที",
  [EnrollPolicy.APPROVAL]: "คำขอของคุณจะส่งให้ผู้สอนพิจารณาก่อน",
  [EnrollPolicy.INVITE_ONLY]: "คอร์สนี้รับเฉพาะผู้ที่ผู้ดูแลเพิ่มให้เท่านั้น",
};
