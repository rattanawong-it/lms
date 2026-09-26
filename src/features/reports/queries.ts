import "server-only";
import { db } from "@/lib/db";
import { assertCourseAccess, requireAtLeast, requireUser, type SessionUser } from "@/lib/rbac";
import { Prisma } from "@/generated/prisma/client";
import { CourseStatus, EnrollmentStatus, LessonType, OrderStatus, Role } from "@/generated/prisma/enums";
import { listTeachCourses } from "@/features/courses/queries";
import {
  COUNTED_STATUSES,
  REPORT_EXPORT_MAX,
  REPORT_PAGE_SIZE,
  completionRate,
  fillMonths,
  fillSalesMonths,
  lastMonths,
  netSales,
  reportDateRange,
  sumSales,
  type CourseReportRow,
  type LearnerReportRow,
  type ReportParams,
  type SalesReportRow,
} from "@/features/reports/lib/report";

/**
 * M16 · FR-16.1–16.4 — ตัวเลขแดชบอร์ดและรายงาน
 * นับด้วย `count`/`groupBy`/SQL ใน DB ทั้งหมด ไม่ดึงแถวมานับใน JS (phase-3-plan ขั้น 6)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ───────────── ผู้เรียน (FR-16.1) ─────────────

/** `/dashboard` — คอร์สที่กำลังเรียน · คาบเรียนสด 7 วันข้างหน้า · ใบประกาศล่าสุด (งานใกล้ครบกำหนดมีแล้วใน M08) */
export async function getLearnerDashboard() {
  const user = await requireUser();
  const now = new Date();
  const learning: Prisma.EnrollmentWhereInput = {
    userId: user.id,
    status: EnrollmentStatus.ACTIVE,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    course: { status: CourseStatus.PUBLISHED },
  };

  const [courses, courseCount, lives, certificates] = await Promise.all([
    db.enrollment.findMany({
      where: learning,
      orderBy: { enrolledAt: "desc" },
      take: 6,
      select: {
        id: true,
        progressPct: true,
        expiresAt: true,
        course: { select: { id: true, title: true } },
      },
    }),
    db.enrollment.count({ where: learning }),
    db.lesson.findMany({
      where: {
        type: LessonType.LIVE,
        // กำลังสอนอยู่ (เริ่มไม่เกิน 3 ชม. ก่อนและยังไม่จบ) หรือจะเริ่มภายใน 7 วัน
        liveStartAt: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000), lte: new Date(now.getTime() + 7 * DAY_MS) },
        OR: [{ liveEndAt: null }, { liveEndAt: { gt: now } }],
        section: { course: { status: CourseStatus.PUBLISHED, enrollments: { some: learning } } },
      },
      orderBy: { liveStartAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        liveStartAt: true,
        section: { select: { course: { select: { id: true, title: true } } } },
      },
    }),
    db.certificate.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { issuedAt: "desc" },
      take: 3,
      select: { id: true, code: true, issuedAt: true, course: { select: { title: true } } },
    }),
  ]);

  return {
    courses: courses.map((e) => ({ ...e.course, progressPct: e.progressPct, expiresAt: e.expiresAt })),
    courseCount,
    lives: lives.map((l) => ({ id: l.id, title: l.title, startAt: l.liveStartAt!, course: l.section.course })),
    certificates,
  };
}

// ───────────── ผู้สอน (FR-16.2) ─────────────

/** จำนวนแถวต่อคอร์สจาก SQL ที่คืน `{ courseId, count }` */
function countMap(rows: { courseId: string; count: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.courseId, Number(r.count)]));
}

/**
 * `/teach` — คอร์สที่ดูแลได้ + ต่อคอร์ส: ผู้เรียน, % จบ, งาน/ข้อสอบรอตรวจ, คำถามที่ยังไม่มีคำตอบ
 * ขอบเขตคอร์สมาจาก `listTeachCourses()` (ตรวจสิทธิ์แล้ว) · id ที่ใช้นับมาจากผลนั้นเท่านั้น
 */
export async function getTeachDashboard(query = "") {
  const courses = await listTeachCourses(query);
  const ids = courses.map((c) => c.id);
  if (ids.length === 0) {
    return { courses: [], totals: { learners: 0, pendingGrading: 0, openQuestions: 0 } };
  }
  const idList = Prisma.join(ids);

  const [enrollments, submissions, attempts, threads, buyers] = await Promise.all([
    db.enrollment.groupBy({
      by: ["courseId", "status"],
      where: { courseId: { in: ids }, status: { in: [...COUNTED_STATUSES] } },
      _count: { _all: true },
    }),
    // งานรอตรวจ = ครั้งส่งล่าสุดของแต่ละคนยังเป็น SUBMITTED (กติกาเดียวกับ latestPerStudent ใน M08)
    db.$queryRaw<{ courseId: string; count: number }[]>`
      SELECT latest."courseId", COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (s."assignmentId", s."userId") a."courseId", s."status"
        FROM "Submission" s JOIN "Assignment" a ON a."id" = s."assignmentId"
        WHERE a."courseId" IN (${idList})
        ORDER BY s."assignmentId", s."userId", s."attemptNo" DESC
      ) latest
      WHERE latest."status" = 'SUBMITTED'
      GROUP BY latest."courseId"`,
    // ข้อสอบอัตนัยรอตรวจ (นับเป็นจำนวน attempt เหมือนหน้าแบบทดสอบ)
    db.$queryRaw<{ courseId: string; count: number }[]>`
      SELECT q."courseId", COUNT(*)::int AS count
      FROM "QuizAttempt" t JOIN "Quiz" q ON q."id" = t."quizId"
      WHERE q."courseId" IN (${idList}) AND t."status" = 'SUBMITTED'
      GROUP BY q."courseId"`,
    db.thread.groupBy({
      by: ["courseId"],
      where: { courseId: { in: ids }, isHidden: false, isResolved: false, posts: { none: { isHidden: false } } },
      _count: { _all: true },
    }),
    // M18 · Q3 — ผู้สอนเห็นจำนวนผู้ซื้อ (ชำระแล้วและยังไม่คืนเงิน) ไม่เห็นยอดเงิน
    db.order.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, status: OrderStatus.PAID }, _count: { _all: true } }),
  ]);

  const pendingSubmissions = countMap(submissions);
  const pendingAttempts = countMap(attempts);
  const openThreads = new Map(threads.map((t) => [t.courseId, t._count._all]));
  const buyerCount = new Map(buyers.map((b) => [b.courseId, b._count._all]));

  const rows = courses.map((c) => {
    const mine = enrollments.filter((e) => e.courseId === c.id);
    const learners = mine.reduce((sum, e) => sum + e._count._all, 0);
    const completed = mine.find((e) => e.status === EnrollmentStatus.COMPLETED)?._count._all ?? 0;
    return {
      ...c,
      learners,
      completionRate: completionRate(completed, learners),
      pendingSubmissions: pendingSubmissions.get(c.id) ?? 0,
      pendingAttempts: pendingAttempts.get(c.id) ?? 0,
      openQuestions: openThreads.get(c.id) ?? 0,
      buyers: buyerCount.get(c.id) ?? 0,
    };
  });

  return {
    courses: rows,
    totals: {
      learners: rows.reduce((s, r) => s + r.learners, 0),
      pendingGrading: rows.reduce((s, r) => s + r.pendingSubmissions + r.pendingAttempts, 0),
      openQuestions: rows.reduce((s, r) => s + r.openQuestions, 0),
    },
  };
}

// ───────────── แอดมิน (FR-16.3) ─────────────

/** ขอบเขตคณะของผู้ดูแล — SUPER_ADMIN = ทั้งระบบ (null) · DEPT_ADMIN = คณะตัวเองเท่านั้น */
function deptScope(actor: SessionUser): string | null {
  if (actor.role === Role.SUPER_ADMIN) return null;
  return actor.departmentId ?? "__no_access__";
}

function deptSql(deptId: string | null) {
  return deptId === null ? Prisma.sql`TRUE` : Prisma.sql`c."departmentId" = ${deptId}`;
}

/** `/admin` — ผู้ใช้ทั้งหมด/ใหม่ 30 วัน · คอร์ส · การลงทะเบียน · อัตราการเรียนจบ แยกตามคณะ · แนวโน้ม 12 เดือน */
export async function getAdminDashboard(now: Date = new Date()) {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);
  const deptId = deptScope(actor);
  // บัญชีที่ลบตาม PDPA แล้วไม่นับเป็นผู้ใช้ (S5)
  const userWhere: Prisma.UserWhereInput = deptId === null ? { deletedAt: null } : { departmentId: deptId, deletedAt: null };
  const courseWhere: Prisma.CourseWhereInput = deptId === null ? {} : { departmentId: deptId };
  const months = lastMonths(now, 12);
  const since = months[0]!.start;

  const [users, newUsers, coursesByStatus, enrollByStatus, departments, usersByDept, coursesByDept, enrollByDept, trend, sales] =
    await Promise.all([
      db.user.count({ where: userWhere }),
      db.user.count({ where: { ...userWhere, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } }),
      db.course.groupBy({ by: ["status"], where: courseWhere, _count: { _all: true } }),
      db.enrollment.groupBy({ by: ["status"], where: { course: courseWhere }, _count: { _all: true } }),
      db.department.findMany({
        where: deptId === null ? {} : { id: deptId },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      db.user.groupBy({ by: ["departmentId"], where: userWhere, _count: { _all: true } }),
      db.course.groupBy({ by: ["departmentId"], where: courseWhere, _count: { _all: true } }),
      db.$queryRaw<{ departmentId: string | null; enrolled: number; completed: number }[]>`
        SELECT c."departmentId",
          COUNT(*) FILTER (WHERE e."status" IN ('ACTIVE', 'COMPLETED', 'EXPIRED'))::int AS enrolled,
          COUNT(*) FILTER (WHERE e."status" = 'COMPLETED')::int AS completed
        FROM "Enrollment" e JOIN "Course" c ON c."id" = e."courseId"
        WHERE ${deptSql(deptId)}
        GROUP BY c."departmentId"`,
      // เวลาเก็บเป็น UTC (timestamp ไม่มีโซน) → แปลงเป็นเวลาไทยก่อนตัดเดือน
      db.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char(date_trunc('month', (e."enrolledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
          COUNT(*)::int AS count
        FROM "Enrollment" e JOIN "Course" c ON c."id" = e."courseId"
        WHERE e."enrolledAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND ${deptSql(deptId)}
        GROUP BY 1`,
      // M18 — ยอดขายเดือนนี้ (ตามวันที่ชำระ เวลาไทย)
      salesByCourse(deptId, null, { gte: months[months.length - 1]!.start }),
    ]);

  const count = <T extends { _count: { _all: number } }>(rows: T[], pick: (r: T) => boolean) =>
    rows.filter(pick).reduce((s, r) => s + r._count._all, 0);
  const enrolled = count(enrollByStatus, (r) => (COUNTED_STATUSES as readonly string[]).includes(r.status));
  const completed = count(enrollByStatus, (r) => r.status === EnrollmentStatus.COMPLETED);

  const byDept = (id: string | null) => ({
    users: usersByDept.find((u) => u.departmentId === id)?._count._all ?? 0,
    courses: coursesByDept.find((c) => c.departmentId === id)?._count._all ?? 0,
    enrolled: Number(enrollByDept.find((e) => e.departmentId === id)?.enrolled ?? 0),
    completed: Number(enrollByDept.find((e) => e.departmentId === id)?.completed ?? 0),
  });
  const departmentRows = departments.map((d) => ({ ...d, ...byDept(d.id) }));
  // ผู้ใช้/คอร์สที่ยังไม่ระบุคณะ — เฉพาะมุมมองทั้งระบบ
  if (deptId === null) {
    const none = byDept(null);
    if (none.users + none.courses + none.enrolled > 0) departmentRows.push({ id: "none", code: "–", name: "ไม่ระบุคณะ", ...none });
  }

  return {
    actor,
    users,
    newUsers,
    courses: {
      total: count(coursesByStatus, () => true),
      published: count(coursesByStatus, (r) => r.status === CourseStatus.PUBLISHED),
      pending: count(coursesByStatus, (r) => r.status === CourseStatus.PENDING_REVIEW),
    },
    enrollments: { enrolled, completed, pending: count(enrollByStatus, (r) => r.status === EnrollmentStatus.PENDING) },
    completionRate: completionRate(completed, enrolled),
    departments: departmentRows.map((d) => ({ ...d, completionRate: completionRate(d.completed, d.enrolled) })),
    trend: fillMonths(months, new Map(trend.map((t) => [t.month, Number(t.count)]))),
    salesThisMonth: sumSales(sales),
  };
}

// ───────────── รายงาน (FR-16.4) ─────────────

async function reportScope(params: ReportParams) {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);
  const deptId = deptScope(actor);
  // ผู้ดูแลคณะเลือกคณะอื่นไม่ได้ — ใช้คณะของตัวเองเสมอ ไม่ว่า URL ส่งอะไรมา
  const department = deptId ?? params.departmentId;
  const courseWhere: Prisma.CourseWhereInput = {
    ...(department ? { departmentId: department } : {}),
    ...(params.courseId ? { id: params.courseId } : {}),
  };
  return { actor, deptId, courseWhere };
}

/** ตัวเลือกของตัวกรอง — เฉพาะในขอบเขตของผู้ดูแล */
export async function getReportFilterOptions() {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);
  const deptId = deptScope(actor);
  const [departments, courses] = await Promise.all([
    db.department.findMany({
      where: deptId === null ? {} : { id: deptId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.course.findMany({
      where: deptId === null ? {} : { departmentId: deptId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, departmentId: true },
    }),
  ]);
  return { canChooseDepartment: deptId === null, departments, courses };
}

async function courseReportRows(params: ReportParams, paging: { skip: number; take: number }) {
  const { courseWhere } = await reportScope(params);
  const enrolledAt = reportDateRange(params);
  const [courses, total] = await Promise.all([
    db.course.findMany({
      where: courseWhere,
      orderBy: { title: "asc" },
      ...paging,
      select: { id: true, title: true, department: { select: { name: true } } },
    }),
    db.course.count({ where: courseWhere }),
  ]);
  const ids = courses.map((c) => c.id);
  const where: Prisma.EnrollmentWhereInput = {
    courseId: { in: ids },
    status: { in: [...COUNTED_STATUSES] },
    ...(enrolledAt.gte || enrolledAt.lt ? { enrolledAt } : {}),
  };
  const [byStatus, avg] = await Promise.all([
    db.enrollment.groupBy({ by: ["courseId", "status"], where, _count: { _all: true } }),
    db.enrollment.groupBy({ by: ["courseId"], where, _avg: { progressPct: true } }),
  ]);
  const rows: CourseReportRow[] = courses.map((c) => {
    const mine = byStatus.filter((r) => r.courseId === c.id);
    const n = (s: EnrollmentStatus) => mine.find((r) => r.status === s)?._count._all ?? 0;
    const avgPct = avg.find((a) => a.courseId === c.id)?._avg.progressPct;
    return {
      title: c.title,
      departmentName: c.department?.name ?? null,
      enrolled: mine.reduce((s, r) => s + r._count._all, 0),
      active: n(EnrollmentStatus.ACTIVE),
      completed: n(EnrollmentStatus.COMPLETED),
      avgProgress: avgPct === null || avgPct === undefined ? null : Math.round(avgPct * 10) / 10,
    };
  });
  return { rows, total };
}

async function learnerReportRows(params: ReportParams, paging: { skip: number; take: number }) {
  const { courseWhere } = await reportScope(params);
  const enrolledAt = reportDateRange(params);
  const where: Prisma.EnrollmentWhereInput = {
    course: courseWhere,
    ...(enrolledAt.gte || enrolledAt.lt ? { enrolledAt } : {}),
  };
  const now = new Date();
  const [rows, total] = await Promise.all([
    db.enrollment.findMany({
      where,
      orderBy: [{ enrolledAt: "desc" }, { id: "asc" }],
      ...paging,
      select: {
        status: true,
        progressPct: true,
        enrolledAt: true,
        completedAt: true,
        expiresAt: true,
        user: { select: { name: true, email: true, externalId: true } },
        course: { select: { title: true } },
      },
    }),
    db.enrollment.count({ where }),
  ]);
  return {
    rows: rows.map(
      (r): LearnerReportRow => ({
        externalId: r.user.externalId,
        name: r.user.name,
        email: r.user.email,
        courseTitle: r.course.title,
        status: r.status,
        expired: r.expiresAt !== null && r.expiresAt <= now,
        progressPct: r.progressPct,
        enrolledAt: r.enrolledAt,
        completedAt: r.completedAt,
      }),
    ),
    total,
  };
}

/**
 * M18 · phase-4-plan ขั้น 6 — ยอดขายต่อคอร์ส นับใน DB (คำสั่งซื้อ PAID + REFUNDED ตามวันที่ชำระ)
 * ขอบเขตคณะของ DEPT_ADMIN บังคับที่ `deptId` เสมอ · `courseId` กรองเพิ่มได้
 */
async function salesByCourse(
  deptId: string | null,
  courseId: string | null,
  paidAt: { gte?: Date; lt?: Date },
): Promise<SalesReportRow[]> {
  const conds = [
    Prisma.sql`o."status" IN ('PAID', 'REFUNDED')`,
    deptSql(deptId),
    courseId ? Prisma.sql`c."id" = ${courseId}` : Prisma.sql`TRUE`,
    paidAt.gte ? Prisma.sql`o."paidAt" >= (${paidAt.gte.toISOString()}::timestamptz AT TIME ZONE 'UTC')` : Prisma.sql`TRUE`,
    paidAt.lt ? Prisma.sql`o."paidAt" < (${paidAt.lt.toISOString()}::timestamptz AT TIME ZONE 'UTC')` : Prisma.sql`TRUE`,
  ];
  const rows = await db.$queryRaw<SalesReportRow[]>`
    SELECT c."title", d."name" AS "departmentName",
      COUNT(*)::int AS orders,
      COALESCE(SUM(o."amount"), 0)::numeric(14, 2)::text AS gross,
      COALESCE(SUM(o."discount"), 0)::numeric(14, 2)::text AS discount,
      COUNT(*) FILTER (WHERE o."couponId" IS NOT NULL)::int AS coupons,
      COUNT(*) FILTER (WHERE o."status" = 'REFUNDED')::int AS refunds,
      COALESCE(SUM(o."refundAmount") FILTER (WHERE o."status" = 'REFUNDED'), 0)::numeric(14, 2)::text AS refunded
    FROM "Order" o
    JOIN "Course" c ON c."id" = o."courseId"
    LEFT JOIN "Department" d ON d."id" = c."departmentId"
    WHERE ${Prisma.join(conds, " AND ")}
    GROUP BY c."id", c."title", d."name"
    ORDER BY SUM(o."amount") DESC, c."title" ASC
    LIMIT ${REPORT_EXPORT_MAX}`;
  return rows.map((r) => ({ ...r, orders: Number(r.orders), coupons: Number(r.coupons), refunds: Number(r.refunds) }));
}

async function salesReportRows(params: ReportParams) {
  const { deptId } = await reportScope(params);
  const department = deptId ?? params.departmentId;
  const rows = await salesByCourse(department, params.courseId, reportDateRange(params));
  return { rows, total: rows.length };
}

/** ยอดขายรายเดือน 12 เดือนล่าสุด (ขอบเขตคณะ/คอร์สเดียวกับตาราง ไม่ใช้ช่วงวันที่) */
export async function getSalesTrend(params: ReportParams, now: Date = new Date()) {
  const { deptId } = await reportScope(params);
  const department = deptId ?? params.departmentId;
  const months = lastMonths(now, 12);
  const rows = await db.$queryRaw<{ month: string; orders: number; gross: string; refunded: string }[]>`
    SELECT to_char(date_trunc('month', (o."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o."amount"), 0)::numeric(14, 2)::text AS gross,
      COALESCE(SUM(o."refundAmount") FILTER (WHERE o."status" = 'REFUNDED'), 0)::numeric(14, 2)::text AS refunded
    FROM "Order" o JOIN "Course" c ON c."id" = o."courseId"
    WHERE o."status" IN ('PAID', 'REFUNDED')
      AND o."paidAt" >= (${months[0]!.start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND ${deptSql(department)}
      AND ${params.courseId ? Prisma.sql`c."id" = ${params.courseId}` : Prisma.sql`TRUE`}
    GROUP BY 1`;
  return fillSalesMonths(
    months,
    rows.map((r) => ({ ...r, orders: Number(r.orders) })),
  );
}

/** `/admin/reports` — หน้าละ 50 แถว */
export async function getReport(params: ReportParams) {
  const paging = { skip: (params.page - 1) * REPORT_PAGE_SIZE, take: REPORT_PAGE_SIZE };
  if (params.view === "sales") {
    const { rows, total } = await salesReportRows(params);
    return {
      view: "sales" as const,
      rows: rows.slice(paging.skip, paging.skip + paging.take),
      total,
      summary: { ...sumSales(rows), net: netSales(sumSales(rows)) },
      pageCount: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)),
    };
  }
  const result =
    params.view === "course"
      ? { view: "course" as const, ...(await courseReportRows(params, paging)) }
      : { view: "learner" as const, ...(await learnerReportRows(params, paging)) };
  return { ...result, pageCount: Math.max(1, Math.ceil(result.total / REPORT_PAGE_SIZE)) };
}

/** ข้อมูลทั้งหมดสำหรับส่งออก (ไม่เกิน `REPORT_EXPORT_MAX` แถว) */
export async function getReportForExport(params: ReportParams) {
  const paging = { skip: 0, take: REPORT_EXPORT_MAX };
  if (params.view === "sales") return { view: "sales" as const, ...(await salesReportRows(params)) };
  return params.view === "course"
    ? { view: "course" as const, ...(await courseReportRows(params, paging)) }
    : { view: "learner" as const, ...(await learnerReportRows(params, paging)) };
}

/** `/teach/courses/[id]/students` — ความคืบหน้าของผู้เรียนทุกคนในคอร์ส (สำหรับส่งออก) */
export async function getCourseProgressForExport(courseId: string) {
  const access = await assertCourseAccess(courseId, "teach");
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { title: true } });
  const { rows } = await learnerRowsForCourse(courseId);
  return { access, course, rows };
}

async function learnerRowsForCourse(courseId: string) {
  const now = new Date();
  const rows = await db.enrollment.findMany({
    where: { courseId },
    orderBy: [{ user: { name: "asc" } }],
    take: REPORT_EXPORT_MAX,
    select: {
      status: true,
      progressPct: true,
      enrolledAt: true,
      completedAt: true,
      expiresAt: true,
      user: { select: { name: true, email: true, externalId: true } },
      course: { select: { title: true } },
    },
  });
  return {
    rows: rows.map(
      (r): LearnerReportRow => ({
        externalId: r.user.externalId,
        name: r.user.name,
        email: r.user.email,
        courseTitle: r.course.title,
        status: r.status,
        expired: r.expiresAt !== null && r.expiresAt <= now,
        progressPct: r.progressPct,
        enrolledAt: r.enrolledAt,
        completedAt: r.completedAt,
      }),
    ),
  };
}
