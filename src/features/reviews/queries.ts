import "server-only";
import { db } from "@/lib/db";
import { getSessionUser, requireAtLeast } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { publicReviewerName, reviewEligibility, summarizeRatings } from "@/features/reviews/lib/rules";
import { ADMIN_REVIEW_PAGE_SIZE, type AdminReviewFilter } from "@/features/reviews/schemas";

const PAGE_REVIEWS = 20;

/**
 * FR-14.1–14.3 — ส่วนรีวิวของหน้ารายละเอียดคอร์ส
 *
 * **ผู้เรียกต้องผ่านกติกาการมองเห็นของคอร์สมาแล้ว** (`getCourseBySlug()` คืนคอร์สนี้ให้ผู้ชมคนนี้)
 * ผู้เยี่ยมชมเห็นรีวิวของคอร์ส PUBLIC ได้ (Q6) · ชื่อแสดงแบบย่อเสมอ
 * ผู้ดูแลเห็นรีวิวที่ถูกซ่อน (ติดป้าย) เพื่อเลิกซ่อนได้ · คนอื่นไม่เห็น
 */
export async function getCourseReviews(course: { id: string; departmentId: string | null }) {
  const viewer = await getSessionUser();
  const [instructor, enrollment] = viewer
    ? await Promise.all([
        db.courseInstructor.findUnique({
          where: { courseId_userId: { courseId: course.id, userId: viewer.id } },
          select: { userId: true },
        }),
        db.enrollment.findUnique({
          where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
          select: { status: true, progressPct: true },
        }),
      ])
    : [null, null];
  const canModerate =
    viewer !== null &&
    (viewer.role === Role.SUPER_ADMIN ||
      (viewer.role === Role.DEPT_ADMIN && viewer.departmentId !== null && viewer.departmentId === course.departmentId));
  const canReply = canModerate || instructor !== null;

  const [ratings, rows, mine] = await Promise.all([
    db.review.findMany({ where: { courseId: course.id, isHidden: false }, select: { rating: true } }),
    db.review.findMany({
      where: { courseId: course.id, ...(canModerate ? {} : { isHidden: false }) },
      orderBy: { createdAt: "desc" },
      take: PAGE_REVIEWS,
      select: {
        id: true,
        userId: true,
        rating: true,
        comment: true,
        reply: true,
        repliedAt: true,
        isHidden: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    viewer
      ? db.review.findUnique({
          where: { courseId_userId: { courseId: course.id, userId: viewer.id } },
          select: { id: true, rating: true, comment: true, isHidden: true },
        })
      : null,
  ]);

  return {
    summary: summarizeRatings(ratings.map((r) => r.rating)),
    reviews: rows.map(({ user, userId, ...r }) => ({ ...r, authorName: publicReviewerName(user.name), isMine: userId === viewer?.id })),
    loggedIn: viewer !== null,
    // ผู้สอนของคอร์สไม่รีวิวคอร์สตัวเอง
    eligibility: instructor ? null : reviewEligibility(enrollment),
    mine,
    canReply,
    canModerate,
  };
}

export type CourseReviews = Awaited<ReturnType<typeof getCourseReviews>>;
export type CourseReviewItem = CourseReviews["reviews"][number];

/** `/admin/reviews` — ผู้ดูแลคณะเห็นเฉพาะคอร์สของคณะตัวเอง */
export async function getAdminReviews(options: { filter: AdminReviewFilter; q: string; page: number }) {
  const user = await requireAtLeast(Role.DEPT_ADMIN);
  const q = options.q.trim();
  const where: Prisma.ReviewWhereInput = {
    ...(user.role === Role.SUPER_ADMIN ? {} : { course: { departmentId: user.departmentId ?? "__none__" } }),
    ...(options.filter === "hidden" ? { isHidden: true } : {}),
    ...(q
      ? {
          OR: [
            { comment: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { course: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * ADMIN_REVIEW_PAGE_SIZE,
      take: ADMIN_REVIEW_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        comment: true,
        reply: true,
        isHidden: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        course: { select: { title: true, slug: true } },
      },
    }),
    db.review.count({ where }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_REVIEW_PAGE_SIZE)) };
}
