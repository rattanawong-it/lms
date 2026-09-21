import { CourseStatus, EnrollPolicy, LessonType, VideoSource, Visibility } from "@/generated/prisma/enums";

/** คำแปลภาษาไทยของ enum ฝั่งคอร์ส — ใช้ร่วมกันทั้ง server และ client */

export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: "ฉบับร่าง",
  PENDING_REVIEW: "รอคณะอนุมัติ",
  PUBLISHED: "เผยแพร่แล้ว",
  ARCHIVED: "เก็บเข้าคลัง",
};

export const COURSE_STATUS_TONE: Record<CourseStatus, string> = {
  DRAFT: "bg-muted text-fg-3",
  PENDING_REVIEW: "bg-warning-bg text-warning-fg",
  PUBLISHED: "bg-success-bg text-success-fg",
  ARCHIVED: "bg-danger-bg text-danger-fg",
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  PUBLIC: "เปิดสาธารณะ",
  INTERNAL: "เฉพาะภายในสถาบัน",
};

export const ENROLL_POLICY_LABEL: Record<EnrollPolicy, string> = {
  OPEN: "สมัครเองได้ทันที",
  APPROVAL: "ต้องให้ผู้สอนอนุมัติ",
  INVITE_ONLY: "ผู้ดูแลเพิ่มให้เท่านั้น",
};

export const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  VIDEO: "วิดีโอ",
  PDF: "เอกสาร PDF",
  TEXT: "บทความ",
  LIVE: "เรียนสด",
  QUIZ: "แบบทดสอบ",
  ASSIGNMENT: "งานที่ต้องส่ง",
};

export const VIDEO_SOURCE_LABEL: Record<VideoSource, string> = {
  UPLOAD: "อัปโหลดไฟล์เอง",
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
};

/** ชนิดบทเรียนที่ยังแก้ไขเนื้อหาไม่ได้ในเฟสนี้ — รอโมดูลของตัวเอง */
export const LESSON_TYPE_PHASE: Partial<Record<LessonType, string>> = {
  QUIZ: "ผูกกับแบบทดสอบได้ใน M07 (เฟส 2)",
  ASSIGNMENT: "ผูกกับงานที่ต้องส่งได้ใน M08 (เฟส 2)",
};
