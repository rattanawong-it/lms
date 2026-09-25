import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { CourseStatus, EnrollmentStatus, LessonType, NotificationType } from "@/generated/prisma/enums";
import {
  DUE_SOON_WINDOW_MS,
  LIVE_SOON_WINDOW_MS,
  LOG_RETENTION_MS,
  READ_NOTIFICATION_RETENTION_MS,
  activeLearners,
  dueDedupeKey,
  liveDedupeKey,
  olderThan,
  pendingSubmitters,
  soonRange,
} from "@/features/cron/lib/rules";

/**
 * FR-12.3 · NFR-05 — งานตามเวลา เรียกจาก `/api/cron/*` เท่านั้น (ผ่าน `CRON_SECRET` แล้ว ไม่มีผู้ใช้)
 *
 * แจ้งเตือนทุกชนิดส่งผ่าน `notify()` พร้อม `dedupeKey` — cron รันซ้ำ/รันซ้อนกันก็ไม่แจ้งซ้ำ
 * คืนจำนวนแจ้งเตือนในแอปที่สร้างใหม่จริง (ไม่นับคนที่เคยได้รับแล้ว)
 */

export type ReminderResult = { items: number; notified: number };

const enrollmentSelect = { userId: true, status: true, expiresAt: true } as const;
const learnerFilter = { status: EnrollmentStatus.ACTIVE } as const;

/** `/api/cron/reminders` (ทุกชั่วโมง) — งานที่ครบกำหนดภายใน 24 ชม. แจ้งผู้ที่ยังไม่ส่ง */
export async function runDueReminders(now: Date = new Date()): Promise<ReminderResult> {
  const assignments = await db.assignment.findMany({
    where: { dueAt: soonRange(now, DUE_SOON_WINDOW_MS), course: { status: CourseStatus.PUBLISHED } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      courseId: true,
      lessonId: true,
      course: {
        select: { title: true, enrollments: { where: learnerFilter, select: enrollmentSelect } },
      },
      submissions: { select: { userId: true, attemptNo: true, status: true } },
    },
  });

  let notified = 0;
  for (const a of assignments) {
    const dueAt = a.dueAt!;
    const userIds = pendingSubmitters(activeLearners(a.course.enrollments, now), a.submissions);
    notified += await notify({
      userIds,
      type: NotificationType.DUE_SOON,
      title: `งาน “${a.title}” ครบกำหนดส่ง ${formatDateTime(dueAt)}`,
      body: `คอร์ส ${a.course.title} · คุณยังไม่ได้ส่งงานนี้`,
      link: a.lessonId ? `/learn/${a.courseId}/${a.lessonId}` : `/learn/${a.courseId}`,
      dedupeKey: dueDedupeKey(a.id, dueAt),
    });
  }
  return { items: assignments.length, notified };
}

/** `/api/cron/live` (ทุก 15 นาที) — คาบเรียนสดที่เริ่มภายใน 1 ชม. แจ้งผู้เรียนของคอร์ส */
export async function runLiveReminders(now: Date = new Date()): Promise<ReminderResult> {
  const lessons = await db.lesson.findMany({
    where: {
      type: LessonType.LIVE,
      liveStartAt: soonRange(now, LIVE_SOON_WINDOW_MS),
      section: { course: { status: CourseStatus.PUBLISHED } },
    },
    select: {
      id: true,
      title: true,
      liveStartAt: true,
      section: {
        select: {
          course: {
            select: {
              id: true,
              title: true,
              enrollments: { where: learnerFilter, select: enrollmentSelect },
            },
          },
        },
      },
    },
  });

  let notified = 0;
  for (const lesson of lessons) {
    const startAt = lesson.liveStartAt!;
    const course = lesson.section.course;
    notified += await notify({
      userIds: activeLearners(course.enrollments, now),
      type: NotificationType.LIVE_SOON,
      title: `คาบเรียนสด “${lesson.title}” เริ่ม ${formatDateTime(startAt)}`,
      body: `คอร์ส ${course.title}`,
      link: `/learn/${course.id}/${lesson.id}`,
      dedupeKey: liveDedupeKey(lesson.id, startAt),
    });
  }
  return { items: lessons.length, notified };
}

export type CleanupResult = { screenEvents: number; auditLogs: number; notifications: number };

/**
 * `/api/cron/cleanup` (วันละครั้ง) — NFR-05 เก็บ log 1 ปี · แจ้งเตือนที่อ่านแล้วเก็บ 180 วัน
 * บันทึก audit ของการลบเอง (ไม่มีผู้กระทำ) เพื่อให้ตรวจย้อนได้ว่าข้อมูลหายไปเพราะอะไร
 */
export async function runCleanup(now: Date = new Date()): Promise<CleanupResult> {
  const logCutoff = olderThan(now, LOG_RETENTION_MS);
  const readCutoff = olderThan(now, READ_NOTIFICATION_RETENTION_MS);

  const [screenEvents, auditLogs, notifications] = await db.$transaction([
    db.screenEventLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
    db.notification.deleteMany({ where: { readAt: { lt: readCutoff } } }),
  ]);
  const result = {
    screenEvents: screenEvents.count,
    auditLogs: auditLogs.count,
    notifications: notifications.count,
  };

  if (result.screenEvents + result.auditLogs + result.notifications > 0) {
    await writeAudit({
      actorId: null,
      action: "cron.cleanup",
      entity: "System",
      after: { ...result, logCutoff: logCutoff.toISOString(), readCutoff: readCutoff.toISOString() },
    });
  }
  return result;
}
