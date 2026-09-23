import "server-only";
import { forbidden } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireAtLeast, requireUser } from "@/lib/rbac";
import { AnnouncementScope, EnrollmentStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { visibleAnnouncementWhere } from "@/features/announcements/lib/audience";

/** M11 · FR-11.1 — อ่านประกาศ (ตรวจสิทธิ์ก่อน query ทุกฟังก์ชัน) */

const announcementSelect = {
  id: true,
  scope: true,
  title: true,
  body: true,
  pinned: true,
  publishedAt: true,
  author: { select: { name: true } },
  course: { select: { id: true, title: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementSelect;

export type AnnouncementItem = Prisma.AnnouncementGetPayload<{
  select: typeof announcementSelect;
}>;

/** ปักหมุดขึ้นก่อน แล้วเรียงใหม่ไปเก่า */
const announcementOrder: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { pinned: "desc" },
  { publishedAt: "desc" },
];

/** จำนวนประกาศสูงสุดที่แสดงในหน้าเดียว — ประกาศเก่ากว่านี้ไม่ค่อยมีคนย้อนอ่าน */
export const ANNOUNCEMENT_PAGE_SIZE = 50;

/**
 * คอร์สที่ผู้ใช้ควรเห็นประกาศ — เรียนอยู่ (ACTIVE และยังไม่หมดอายุ) หรือเป็นผู้สอน
 * เทียบ `expiresAt` เองเพราะไม่มีงานเปลี่ยนสถานะเป็น EXPIRED อัตโนมัติ (CLAUDE.md §5)
 */
async function audienceCourseIds(userId: string): Promise<string[]> {
  const now = new Date();
  const [enrollments, teaching] = await Promise.all([
    db.enrollment.findMany({
      where: {
        userId,
        status: EnrollmentStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { courseId: true },
    }),
    db.courseInstructor.findMany({ where: { userId }, select: { courseId: true } }),
  ]);
  return [...new Set([...enrollments, ...teaching].map((row) => row.courseId))];
}

/** หน้า /announcements และกล่องประกาศบนหน้าหลัก */
export async function getMyAnnouncements(
  limit = ANNOUNCEMENT_PAGE_SIZE,
): Promise<AnnouncementItem[]> {
  const user = await requireUser();
  const courseIds = await audienceCourseIds(user.id);

  return db.announcement.findMany({
    where: visibleAnnouncementWhere(user, courseIds),
    select: announcementSelect,
    orderBy: announcementOrder,
    take: limit,
  });
}

/** หน้าจัดการประกาศของคอร์ส — ผู้สอนของคอร์ส หรือผู้ดูแลคณะเจ้าของคอร์ส */
export async function getCourseAnnouncements(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  const [course, announcements] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.announcement.findMany({
      where: { scope: AnnouncementScope.COURSE, courseId },
      select: announcementSelect,
      orderBy: announcementOrder,
      take: ANNOUNCEMENT_PAGE_SIZE,
    }),
  ]);

  return { course, announcements };
}

/**
 * หน้า /admin/announcements — ประกาศทั้งระบบและระดับคณะ
 *   Super Admin เห็นทั้งหมดและเลือกคณะได้ทุกคณะ
 *   Dept Admin เห็นและประกาศได้เฉพาะคณะของตัวเอง
 */
export async function getOrgAnnouncements() {
  const user = await requireAtLeast(Role.DEPT_ADMIN);
  const isSuper = user.role === Role.SUPER_ADMIN;
  // Dept Admin ที่ไม่ได้สังกัดคณะไม่มีกลุ่มผู้รับให้ประกาศ (deny by default)
  if (!isSuper && !user.departmentId) forbidden();

  const where: Prisma.AnnouncementWhereInput = isSuper
    ? { scope: { in: [AnnouncementScope.GLOBAL, AnnouncementScope.DEPARTMENT] } }
    : { scope: AnnouncementScope.DEPARTMENT, departmentId: user.departmentId };

  const [announcements, departments] = await Promise.all([
    db.announcement.findMany({
      where,
      select: announcementSelect,
      orderBy: announcementOrder,
      take: ANNOUNCEMENT_PAGE_SIZE,
    }),
    db.department.findMany({
      where: isSuper ? {} : { id: user.departmentId! },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return { announcements, departments, canPostGlobal: isSuper };
}
