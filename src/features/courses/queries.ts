import "server-only";
import { db } from "@/lib/db";
import { assertCourseAccess, requireCourseCreator, requireAtLeast } from "@/lib/rbac";
import { CourseStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { parseCompletionRule, type CompletionRule } from "@/features/courses/schemas";

/** M04 — ข้อมูลฝั่งผู้สอนและผู้ดูแล (หน้า catalog สาธารณะอยู่ใน features/catalog) */

export type TeachCourseRow = {
  id: string;
  slug: string;
  title: string;
  status: CourseStatus;
  visibility: string;
  departmentName: string | null;
  categoryName: string | null;
  lessonCount: number;
  enrollmentCount: number;
  updatedAt: Date;
  /** ผู้ใช้ปัจจุบันเป็นผู้สอนของคอร์สนี้ (ไม่ใช่แค่ผู้ดูแลที่มองเห็น) */
  isOwnCourse: boolean;
};

const rowSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  visibility: true,
  updatedAt: true,
  department: { select: { name: true } },
  category: { select: { name: true } },
  instructors: { select: { userId: true } },
  sections: { select: { _count: { select: { lessons: true } } } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseSelect;

function toRow(
  row: Prisma.CourseGetPayload<{ select: typeof rowSelect }>,
  userId: string,
): TeachCourseRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    departmentName: row.department?.name ?? null,
    categoryName: row.category?.name ?? null,
    lessonCount: row.sections.reduce((sum, s) => sum + s._count.lessons, 0),
    enrollmentCount: row._count.enrollments,
    updatedAt: row.updatedAt,
    isOwnCourse: row.instructors.some((i) => i.userId === userId),
  };
}

/**
 * FR-04.1 — คอร์สที่ผู้ใช้คนนี้ดูแลได้
 *
 * ผู้สอน       เห็นเฉพาะคอร์สที่ตนเป็นผู้สอน
 * ผู้ดูแลคณะ   เห็นคอร์สของคณะตน และคอร์สที่ตนสอนเอง
 * ผู้ดูแลระบบ  เห็นทั้งหมด
 */
export async function listTeachCourses(): Promise<TeachCourseRow[]> {
  const user = await requireCourseCreator();

  const where: Prisma.CourseWhereInput =
    user.role === Role.SUPER_ADMIN
      ? {}
      : user.role === Role.DEPT_ADMIN && user.departmentId
        ? {
            OR: [
              { departmentId: user.departmentId },
              { instructors: { some: { userId: user.id } } },
            ],
          }
        : { instructors: { some: { userId: user.id } } };

  const rows = await db.course.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    select: rowSelect,
  });

  return rows.map((row) => toRow(row, user.id));
}

export type CourseEditor = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string | null;
  status: CourseStatus;
  visibility: string;
  enrollPolicy: string;
  sequential: boolean;
  categoryId: string | null;
  departmentId: string | null;
  completionRule: CompletionRule;
  publishedAt: Date | null;
  canManage: boolean;
  instructors: { userId: string; name: string; email: string; role: string }[];
};

/** FR-04.1 — ข้อมูลคอร์สสำหรับฟอร์มแก้ไข */
export async function getCourseForEdit(courseId: string): Promise<CourseEditor> {
  const access = await assertCourseAccess(courseId, "teach");

  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      level: true,
      status: true,
      visibility: true,
      enrollPolicy: true,
      sequential: true,
      categoryId: true,
      departmentId: true,
      completionRule: true,
      publishedAt: true,
      instructors: {
        orderBy: { role: "asc" },
        select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      },
    },
  });

  return {
    ...course,
    completionRule: parseCompletionRule(course.completionRule),
    canManage: access.isManager,
    instructors: course.instructors.map((i) => ({
      userId: i.userId,
      name: i.user.name,
      email: i.user.email,
      role: i.role,
    })),
  };
}

export type CurriculumSection = {
  id: string;
  title: string;
  position: number;
  lessons: {
    id: string;
    title: string;
    type: string;
    position: number;
    isPreview: boolean;
    videoSource: string | null;
    videoUrl: string | null;
    durationSec: number | null;
    liveUrl: string | null;
    liveStartAt: Date | null;
    liveEndAt: Date | null;
    assetId: string | null;
  }[];
};

/** FR-04.2 — โครงสร้างบท/บทเรียนของคอร์ส */
export async function getCurriculum(courseId: string): Promise<CurriculumSection[]> {
  await assertCourseAccess(courseId, "teach");

  const sections = await db.section.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      position: true,
      lessons: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          position: true,
          isPreview: true,
          videoSource: true,
          videoUrl: true,
          durationSec: true,
          liveUrl: true,
          liveStartAt: true,
          liveEndAt: true,
          assetId: true,
        },
      },
    },
  });

  return sections;
}

/** หัวข้อคอร์สสั้น ๆ สำหรับ breadcrumb และ metadata ของหน้าผู้สอน */
export async function getCourseHeader(
  courseId: string,
): Promise<{ id: string; title: string; slug: string; status: CourseStatus }> {
  await assertCourseAccess(courseId, "teach");
  return db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, status: true },
  });
}

/** ตัวเลือกหมวดหมู่และคณะสำหรับฟอร์มคอร์ส (ผู้สอนขึ้นไปเรียกได้) */
export async function courseFormOptions(): Promise<{
  categories: { id: string; name: string }[];
  departments: { id: string; code: string; name: string }[];
}> {
  await requireCourseCreator();

  const [categories, departments] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  return { categories, departments };
}

export type ReviewQueueRow = TeachCourseRow & { instructorNames: string[] };

/**
 * FR-04.6 — คิวคอร์สที่รออนุมัติเผยแพร่ (ผู้ดูแลคณะขึ้นไป)
 * ผู้ดูแลคณะเห็นเฉพาะคอร์สของคณะตน
 */
export async function listReviewQueue(): Promise<ReviewQueueRow[]> {
  const user = await requireAtLeast(Role.DEPT_ADMIN);

  const where: Prisma.CourseWhereInput = {
    status: CourseStatus.PENDING_REVIEW,
    ...(user.role === Role.SUPER_ADMIN
      ? {}
      : { departmentId: user.departmentId ?? "__no_access__" }),
  };

  const rows = await db.course.findMany({
    where,
    orderBy: [{ updatedAt: "asc" }],
    select: { ...rowSelect, instructors: { select: { userId: true, user: { select: { name: true } } } } },
  });

  return rows.map((row) => ({
    ...toRow(row, user.id),
    instructorNames: row.instructors.map((i) => i.user.name),
  }));
}
