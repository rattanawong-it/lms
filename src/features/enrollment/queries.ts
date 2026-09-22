import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, getSessionUser, requireUser } from "@/lib/rbac";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { mediaSrc } from "@/lib/rich-text-doc";
import { parseCompletionRule } from "@/features/courses/schemas";
import {
  isLessonUnlocked,
  resumeLessonId,
  unlockedLessonIds,
  type OutlineLesson,
} from "@/features/enrollment/lib/progress";

/**
 * M06 — การอ่านข้อมูลการลงทะเบียนและความคืบหน้า
 * ทุกฟังก์ชันตรวจสิทธิ์ก่อนแตะข้อมูลตาม NFR-04
 */

/**
 * การลงทะเบียนหมดอายุแล้วหรือยัง
 *
 * `status` ใน DB ยังเป็น ACTIVE จนกว่างานเก็บกวาดจะมาปรับ (ยังไม่มีในเฟส 1)
 * ทุกที่ที่ตัดสินสิทธิ์จึงต้องเทียบ `expiresAt` กับเวลาปัจจุบันเองเสมอ
 * — กติกาเดียวกับที่ `assertCourseAccess(..., "learn")` ใช้
 */
export function isExpired(
  enrollment: { status: EnrollmentStatus; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (enrollment.status === EnrollmentStatus.EXPIRED) return true;
  return enrollment.expiresAt !== null && enrollment.expiresAt <= now;
}

/** สถานะที่ผู้เรียนเห็นจริงบนหน้าจอ (ต่างจาก `status` ใน DB ตรงเรื่องหมดอายุ) */
export type MyCourseBucket = "active" | "completed" | "expired" | "pending";

export function bucketOf(
  enrollment: { status: EnrollmentStatus; expiresAt: Date | null },
  now: Date = new Date(),
): MyCourseBucket | null {
  if (enrollment.status === EnrollmentStatus.PENDING) return "pending";
  if (enrollment.status === EnrollmentStatus.DROPPED) return null;
  if (enrollment.status === EnrollmentStatus.COMPLETED) return "completed";
  if (isExpired(enrollment, now)) return "expired";
  return "active";
}

export type MyCourseRow = {
  enrollmentId: string;
  courseId: string;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  instructorNames: string[];
  progressPct: number;
  lessonCount: number;
  completedLessons: number;
  status: EnrollmentStatus;
  expiresAt: Date | null;
  completedAt: Date | null;
  enrolledAt: Date;
};

export type MyCourses = Record<MyCourseBucket, MyCourseRow[]>;

/** FR-06.6 — คอร์สของฉัน แยกเป็น กำลังเรียน / เรียนจบ / หมดอายุ (+ คำขอที่รออนุมัติ) */
export async function listMyCourses(): Promise<MyCourses> {
  const user = await requireUser("/my-courses");

  const rows = await db.enrollment.findMany({
    where: { userId: user.id, status: { not: EnrollmentStatus.DROPPED } },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      courseId: true,
      status: true,
      progressPct: true,
      expiresAt: true,
      completedAt: true,
      enrolledAt: true,
      _count: { select: { progress: { where: { completed: true } } } },
      course: {
        select: {
          slug: true,
          title: true,
          summary: true,
          coverKey: true,
          instructors: { select: { user: { select: { name: true } } } },
          sections: { select: { _count: { select: { lessons: true } } } },
        },
      },
    },
  });

  // ภาพปกเก็บเป็น object key แต่หน้าเว็บเสิร์ฟผ่าน /api/media/[assetId] จึงต้องย้อนหารหัส Asset
  // ครั้งเดียวสำหรับทุกแถว (กติกาเดียวกับ `withCovers()` ของ M03)
  const coverKeys = rows.flatMap((row) => (row.course.coverKey ? [row.course.coverKey] : []));
  const assets =
    coverKeys.length > 0
      ? await db.asset.findMany({
          where: { key: { in: coverKeys }, status: "READY" },
          select: { id: true, key: true },
        })
      : [];
  const assetIdByKey = new Map(assets.map((asset) => [asset.key, asset.id]));

  const now = new Date();
  const result: MyCourses = { active: [], completed: [], expired: [], pending: [] };

  for (const row of rows) {
    const bucket = bucketOf(row, now);
    if (!bucket) continue;

    const coverAssetId = row.course.coverKey ? assetIdByKey.get(row.course.coverKey) : undefined;

    result[bucket].push({
      enrollmentId: row.id,
      courseId: row.courseId,
      slug: row.course.slug,
      title: row.course.title,
      summary: row.course.summary,
      coverUrl: coverAssetId ? mediaSrc(coverAssetId) : null,
      instructorNames: row.course.instructors.map((i) => i.user.name),
      progressPct: row.progressPct,
      lessonCount: row.course.sections.reduce((sum, s) => sum + s._count.lessons, 0),
      completedLessons: row._count.progress,
      status: row.status,
      expiresAt: row.expiresAt,
      completedAt: row.completedAt,
      enrolledAt: row.enrolledAt,
    });
  }

  return result;
}

export type EnrollmentStateKind =
  | "none"
  | "pending"
  | "active"
  | "completed"
  | "expired"
  | "dropped";

export type EnrollmentState = {
  kind: EnrollmentStateKind;
  enrollmentId: string | null;
  progressPct: number;
  expiresAt: Date | null;
};

/**
 * สถานะการลงทะเบียนของผู้ใช้ปัจจุบันกับคอร์สหนึ่ง — ใช้ตัดสินปุ่มบนหน้ารายละเอียดคอร์ส
 * ผู้เยี่ยมชมที่ยังไม่ล็อกอินได้ `null` (หน้าคอร์สเปิดให้คนนอกดูได้ตาม FR-03.4)
 */
export async function getEnrollmentState(courseId: string): Promise<EnrollmentState | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { id: true, status: true, progressPct: true, expiresAt: true },
  });

  if (!enrollment) {
    return { kind: "none", enrollmentId: null, progressPct: 0, expiresAt: null };
  }

  const kind: EnrollmentStateKind =
    enrollment.status === EnrollmentStatus.DROPPED
      ? "dropped"
      : enrollment.status === EnrollmentStatus.PENDING
        ? "pending"
        : enrollment.status === EnrollmentStatus.COMPLETED
          ? "completed"
          : isExpired(enrollment)
            ? "expired"
            : "active";

  return {
    kind,
    enrollmentId: enrollment.id,
    progressPct: enrollment.progressPct,
    expiresAt: enrollment.expiresAt,
  };
}

const outlineSelect = {
  id: true,
  title: true,
  slug: true,
  sequential: true,
  protectionEnabled: true,
  sections: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      lessons: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          isPreview: true,
          durationSec: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

export type LearnLesson = {
  id: string;
  title: string;
  type: string;
  durationSec: number | null;
  isPreview: boolean;
  completed: boolean;
  locked: boolean;
  lastPositionSec: number;
};

export type LearnOutline = {
  course: {
    id: string;
    slug: string;
    title: string;
    sequential: boolean;
    protectionEnabled: boolean;
  };
  sections: { id: string; title: string; lessons: LearnLesson[] }[];
  /** เรียงแบนตามลำดับเรียนจริง — ใช้หาบทก่อนหน้า/ถัดไป */
  flat: LearnLesson[];
  totalLessons: number;
  completedLessons: number;
  progressPct: number;
  /** null เมื่อผู้ดูเป็นผู้สอน/ผู้ดูแลที่ไม่ได้ลงทะเบียน — ความคืบหน้าจะไม่ถูกบันทึก */
  enrollmentId: string | null;
  isPreviewingAsStaff: boolean;
};

/**
 * FR-06.4/06.5 — สารบัญของหน้าเรียน พร้อมสถานะจบและสถานะล็อกรายบท
 *
 * ตรวจสิทธิ์ด้วย `assertCourseAccess(..., "learn")` ซึ่งปล่อยผ่านทั้งผู้เรียนที่ลงทะเบียนแล้ว
 * และผู้สอน/ผู้ดูแลของคอร์ส (เพื่อให้ดูหน้าที่ผู้เรียนเห็นจริงได้) — กรณีหลังจะไม่มี enrollment
 */
export async function getLearnOutline(courseId: string): Promise<LearnOutline> {
  const access = await assertCourseAccess(courseId, "learn");

  const course = await db.course.findUnique({ where: { id: courseId }, select: outlineSelect });
  if (!course) notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: access.user.id, courseId } },
    select: {
      id: true,
      progressPct: true,
      progress: { select: { lessonId: true, completed: true, lastPositionSec: true } },
    },
  });

  const progressByLesson = new Map(
    (enrollment?.progress ?? []).map((p) => [p.lessonId, p] as const),
  );

  // ต้องสร้างรายการแบนให้ครบก่อน เพราะการล็อกบทหนึ่งขึ้นกับบททั้งหมดที่อยู่ก่อนหน้า ข้ามบทด้วย
  const ordered: OutlineLesson[] = course.sections.flatMap((section) =>
    section.lessons.map((lesson) => ({
      id: lesson.id,
      isPreview: lesson.isPreview,
      completed: progressByLesson.get(lesson.id)?.completed ?? false,
    })),
  );

  const source = course.sections.flatMap((section) => section.lessons);
  const byId = new Map<string, LearnLesson>();

  const flat: LearnLesson[] = ordered.map((entry, index) => {
    const lesson = source[index]!;
    const item: LearnLesson = {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      durationSec: lesson.durationSec,
      isPreview: entry.isPreview,
      completed: entry.completed,
      locked: !isLessonUnlocked(ordered, index, course.sequential),
      lastPositionSec: progressByLesson.get(lesson.id)?.lastPositionSec ?? 0,
    };
    byId.set(item.id, item);
    return item;
  });

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      sequential: course.sequential,
      protectionEnabled: course.protectionEnabled,
    },
    sections: course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      lessons: section.lessons.map((lesson) => byId.get(lesson.id)!),
    })),
    flat,
    totalLessons: flat.length,
    completedLessons: flat.filter((l) => l.completed).length,
    progressPct: enrollment?.progressPct ?? 0,
    enrollmentId: enrollment?.id ?? null,
    isPreviewingAsStaff: enrollment === null,
  };
}

/** FR-06.4 — บทเรียนที่ปุ่ม "เรียนต่อ" ของคอร์สนี้ควรพาไป (null = คอร์สยังไม่มีบทเรียน) */
export async function getResumeLessonId(courseId: string): Promise<string | null> {
  const access = await assertCourseAccess(courseId, "learn");

  const [course, enrollment] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      select: {
        sequential: true,
        sections: {
          orderBy: { position: "asc" },
          select: {
            lessons: { orderBy: { position: "asc" }, select: { id: true, isPreview: true } },
          },
        },
      },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: access.user.id, courseId } },
      select: {
        lastLessonId: true,
        progress: { where: { completed: true }, select: { lessonId: true } },
      },
    }),
  ]);
  if (!course) notFound();

  const completed = new Set((enrollment?.progress ?? []).map((p) => p.lessonId));
  const lessons: OutlineLesson[] = course.sections.flatMap((s) =>
    s.lessons.map((l) => ({
      id: l.id,
      isPreview: l.isPreview,
      completed: completed.has(l.id),
    })),
  );

  return resumeLessonId(lessons, enrollment?.lastLessonId ?? null, course.sequential);
}

/** เนื้อหาของบทเรียนหนึ่งบนหน้าเรียน — เรียกหลังตรวจสิทธิ์และสถานะล็อกแล้ว */
export async function getLearnLesson(courseId: string, lessonId: string) {
  await assertCourseAccess(courseId, "learn");

  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, section: { courseId } },
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      videoSource: true,
      videoUrl: true,
      durationSec: true,
      liveUrl: true,
      liveStartAt: true,
      liveEndAt: true,
      recordingUrl: true,
      assetId: true,
      attachments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          downloadable: true,
          asset: { select: { id: true, originalName: true } },
        },
      },
    },
  });
  if (!lesson) notFound();
  return lesson;
}

export type RosterRow = {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string;
  status: EnrollmentStatus;
  source: string;
  progressPct: number;
  expiresAt: Date | null;
  enrolledAt: Date;
  completedAt: Date | null;
  expired: boolean;
};

export type CourseRoster = {
  courseId: string;
  title: string;
  enrollPolicy: string;
  minProgress: number;
  pending: RosterRow[];
  enrolled: RosterRow[];
  counts: { active: number; completed: number; expired: number; pending: number };
};

/** FR-06.1/06.2 — รายชื่อผู้เรียนและคิวคำขออนุมัติของคอร์ส (ผู้สอนขึ้นไป) */
export async function getCourseRoster(courseId: string): Promise<CourseRoster> {
  await assertCourseAccess(courseId, "teach");

  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { id: true, title: true, enrollPolicy: true, completionRule: true },
  });

  const rows = await db.enrollment.findMany({
    where: { courseId, status: { not: EnrollmentStatus.DROPPED } },
    orderBy: [{ enrolledAt: "desc" }],
    select: {
      id: true,
      userId: true,
      status: true,
      source: true,
      progressPct: true,
      expiresAt: true,
      enrolledAt: true,
      completedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const now = new Date();
  const mapped: RosterRow[] = rows.map((row) => ({
    enrollmentId: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    status: row.status,
    source: row.source,
    progressPct: row.progressPct,
    expiresAt: row.expiresAt,
    enrolledAt: row.enrolledAt,
    completedAt: row.completedAt,
    expired: isExpired(row, now),
  }));

  const pending = mapped.filter((r) => r.status === EnrollmentStatus.PENDING);
  const enrolled = mapped.filter((r) => r.status !== EnrollmentStatus.PENDING);

  return {
    courseId: course.id,
    title: course.title,
    enrollPolicy: course.enrollPolicy,
    minProgress: parseCompletionRule(course.completionRule).minProgress,
    pending,
    enrolled,
    counts: {
      pending: pending.length,
      completed: enrolled.filter((r) => r.status === EnrollmentStatus.COMPLETED).length,
      expired: enrolled.filter((r) => r.expired && r.status !== EnrollmentStatus.COMPLETED).length,
      active: enrolled.filter((r) => r.status === EnrollmentStatus.ACTIVE && !r.expired).length,
    },
  };
}

/* ────────────────── ด่านเดียวของ "บทเรียนนี้เปิดให้คนนี้ดูได้ไหม" ────────────────── */

export type LessonAccess = {
  userId: string;
  courseId: string;
  slug: string;
  sequential: boolean;
  completionRule: Prisma.JsonValue;
  /** null = ผู้สอน/ผู้ดูแลที่ไม่ได้ลงทะเบียน — ดูได้แต่ไม่บันทึกความคืบหน้า */
  enrollmentId: string | null;
  /** ทุกบทของคอร์สเรียงตามลำดับจริง พร้อมสถานะจบ — ใช้ตัดสินการล็อก */
  lessons: OutlineLesson[];
  lesson: { id: string; type: string; isPreview: boolean; durationSec: number | null };
  /** ผ่านกติกาเรียนตามลำดับแล้วหรือยัง (FR-06.5) */
  unlocked: boolean;
  lastPositionSec: number;
};

/**
 * ด่านร่วมของทุกเส้นทางที่แตะเนื้อหาบทเรียน — ทั้ง action ของความคืบหน้า (M06)
 * และการออก URL ของไฟล์วิดีโอ/PDF (M05 · FR-15.7)
 *
 * ไม่รับ `courseId` จาก client เลย — ย้อนขึ้นไปจาก `lessonId` แล้วตรวจสิทธิ์ตามคอร์สที่เจอจริง
 * คืน `null` เมื่อไม่มีบทเรียนนั้น ส่วนกรณีไม่มีสิทธิ์จะถูก `assertCourseAccess` ตัดไปก่อนแล้ว
 */
export async function getLessonAccess(lessonId: string): Promise<LessonAccess | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      type: true,
      isPreview: true,
      durationSec: true,
      section: {
        select: {
          course: {
            select: {
              id: true,
              slug: true,
              sequential: true,
              completionRule: true,
              sections: {
                orderBy: { position: "asc" },
                select: {
                  lessons: {
                    orderBy: { position: "asc" },
                    select: { id: true, isPreview: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!lesson) return null;

  const course = lesson.section.course;
  const access = await assertCourseAccess(course.id, "learn");

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: access.user.id, courseId: course.id } },
    select: {
      id: true,
      progress: { select: { lessonId: true, completed: true, lastPositionSec: true } },
    },
  });

  const progress = new Map((enrollment?.progress ?? []).map((p) => [p.lessonId, p] as const));

  const lessons: OutlineLesson[] = course.sections.flatMap((s) =>
    s.lessons.map((l) => ({
      id: l.id,
      isPreview: l.isPreview,
      completed: progress.get(l.id)?.completed ?? false,
    })),
  );

  return {
    userId: access.user.id,
    courseId: course.id,
    slug: course.slug,
    sequential: course.sequential,
    completionRule: course.completionRule,
    enrollmentId: enrollment?.id ?? null,
    lessons,
    lesson: {
      id: lesson.id,
      type: lesson.type,
      isPreview: lesson.isPreview,
      durationSec: lesson.durationSec,
    },
    unlocked: unlockedLessonIds(lessons, course.sequential).has(lesson.id),
    lastPositionSec: progress.get(lesson.id)?.lastPositionSec ?? 0,
  };
}
