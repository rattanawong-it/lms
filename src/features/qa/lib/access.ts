import "server-only";
import { cache } from "react";
import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { qaPermissions, type QaPermissions } from "@/features/qa/lib/rules";

export type QaAccess = QaPermissions & {
  user: SessionUser;
  course: { id: string; title: string };
  /** ผู้สอนของคอร์ส — ใช้ติดป้าย "ผู้สอน" ข้างชื่อ และเป็นผู้รับแจ้งเตือนคำถามใหม่ */
  instructorIds: string[];
};

/**
 * ตรวจสิทธิ์กระดานถาม-ตอบของคอร์ส — ทุก query/action ของ M13 เรียกก่อนแตะข้อมูล
 *
 * ต่างจาก `assertCourseAccess(…, "learn")` ตรงที่ผู้เรียนหมดอายุยังอ่านได้ (phase-3-plan ขั้น 4)
 * ไม่มีคอร์ส → 404 · ไม่มีสิทธิ์อ่าน → 403 · ตัดสินผู้ดูแลแบบเดียวกับ `assertCourseAccess`
 */
export const assertQaAccess = cache(async (courseId: string): Promise<QaAccess> => {
  const user = await requireUser();
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      departmentId: true,
      instructors: { select: { userId: true } },
      enrollments: { where: { userId: user.id }, select: { status: true, expiresAt: true } },
    },
  });
  if (!course) notFound();

  const instructorIds = course.instructors.map((i) => i.userId);
  const isManager =
    user.role === Role.SUPER_ADMIN ||
    (user.role === Role.DEPT_ADMIN && user.departmentId !== null && user.departmentId === course.departmentId);
  const perms = qaPermissions({
    isInstructor: instructorIds.includes(user.id),
    isManager,
    enrollment: course.enrollments[0] ?? null,
  });
  if (!perms) forbidden();

  return { ...perms, user, course: { id: course.id, title: course.title }, instructorIds };
});
