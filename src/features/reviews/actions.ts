"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { CourseStatus, NotificationType } from "@/generated/prisma/enums";
import { recomputeCourseRating } from "@/features/reviews/lib/aggregate";
import { reviewEligibility } from "@/features/reviews/lib/rules";
import { hideReviewSchema, replyReviewSchema, upsertReviewSchema, REVIEW_MIN_PROGRESS } from "@/features/reviews/schemas";

/**
 * M14 · FR-14.1–14.3 — เขียน/แก้รีวิวของตัวเอง · ผู้สอนตอบกลับ · ผู้ดูแลซ่อน
 * ทุกการเขียนที่กระทบค่าเฉลี่ยคำนวณ `Course.ratingAvg/ratingCount` ใหม่ใน transaction เดียวกัน
 */

const NOT_FOUND: ActionResult = { ok: false, message: "ไม่พบรีวิวนี้" };

function revalidateReviews(courseId: string, slug: string) {
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/courses");
  revalidatePath("/admin/reviews");
  revalidatePath(`/teach/courses/${courseId}`);
}

/** FR-14.1 — 1 รีวิวต่อคอร์สต่อคน · ส่งซ้ำ = แก้ของเดิม */
export async function upsertMyReview(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = upsertReviewSchema.safeParse({
    courseId: formData.get("courseId"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบรีวิวอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { courseId, rating, comment } = parsed.data;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      instructors: { select: { userId: true } },
      enrollments: { where: { userId: user.id }, select: { status: true, progressPct: true } },
    },
  });
  if (!course || course.status !== CourseStatus.PUBLISHED) return { ok: false, message: "ไม่พบคอร์สนี้" };

  // ตรวจเงื่อนไขซ้ำฝั่ง server — หน้าจอซ่อนฟอร์มไว้แล้วแต่ไม่เชื่อ
  const eligibility = reviewEligibility(course.enrollments[0] ?? null);
  if (!eligibility.ok) {
    return {
      ok: false,
      message:
        eligibility.reason === "progress"
          ? `รีวิวได้เมื่อเรียนไปแล้วอย่างน้อย ${REVIEW_MIN_PROGRESS}% (ตอนนี้ ${eligibility.progressPct}%)`
          : "รีวิวได้เฉพาะผู้ที่ลงทะเบียนเรียนคอร์สนี้",
    };
  }
  const limit = rateLimit(`review:${user.id}`, { windowSec: 600, max: 10 });
  if (!limit.ok) return { ok: false, message: "คุณแก้รีวิวถี่เกินไป กรุณารอสักครู่" };

  const before = await db.review.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
    select: { id: true, rating: true, comment: true },
  });
  const review = await db.$transaction(async (tx) => {
    const saved = await tx.review.upsert({
      where: { courseId_userId: { courseId, userId: user.id } },
      create: { courseId, userId: user.id, rating, comment },
      update: { rating, comment },
      select: { id: true },
    });
    await recomputeCourseRating(tx, courseId);
    return saved;
  });
  await writeAudit({
    actorId: user.id,
    action: before ? "review.update" : "review.create",
    entity: "Review",
    entityId: review.id,
    before: before ? { rating: before.rating, comment: before.comment } : null,
    after: { rating, comment },
  });

  // แจ้งผู้สอนเฉพาะรีวิวใหม่ (in-app — แก้รีวิวไม่แจ้งซ้ำ)
  if (!before) {
    await notify({
      userIds: course.instructors.map((i) => i.userId).filter((id) => id !== user.id),
      type: NotificationType.SYSTEM,
      title: `มีรีวิวใหม่ ${rating} ดาว ในคอร์ส “${course.title}”`,
      body: comment ? (comment.length > 140 ? `${comment.slice(0, 140)}…` : comment) : null,
      link: `/courses/${course.slug}#review-${review.id}`,
    });
  }

  revalidateReviews(courseId, course.slug);
  return { ok: true, message: before ? "บันทึกการแก้ไขรีวิวแล้ว" : "ขอบคุณสำหรับรีวิว" };
}

async function reviewContext(id: string) {
  return db.review.findUnique({
    where: { id },
    select: {
      id: true,
      courseId: true,
      userId: true,
      reply: true,
      isHidden: true,
      course: { select: { slug: true } },
    },
  });
}

/** FR-14.3 — ผู้สอนของคอร์ส (หรือผู้ดูแล) ตอบกลับ 1 ข้อความ · ส่งว่าง = ลบคำตอบกลับ */
export async function replyToReview(formData: FormData): Promise<ActionResult> {
  const parsed = replyReviewSchema.safeParse({ id: formData.get("id"), reply: formData.get("reply") });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบคำตอบกลับอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const review = await reviewContext(parsed.data.id);
  if (!review) return NOT_FOUND;
  const { user } = await assertCourseAccess(review.courseId, "teach");

  const reply = parsed.data.reply || null;
  await db.review.update({ where: { id: review.id }, data: { reply, repliedAt: reply ? new Date() : null } });
  await writeAudit({
    actorId: user.id,
    action: "review.reply",
    entity: "Review",
    entityId: review.id,
    before: { reply: review.reply },
    after: { reply },
  });
  revalidateReviews(review.courseId, review.course.slug);
  return { ok: true, message: reply ? "บันทึกคำตอบกลับแล้ว" : "ลบคำตอบกลับแล้ว" };
}

/** FR-14.3 — ผู้ดูแล (SUPER_ADMIN / DEPT_ADMIN ของคณะเจ้าของคอร์ส) ซ่อน/เลิกซ่อน · ไม่นับในค่าเฉลี่ย */
export async function setReviewHidden(formData: FormData): Promise<ActionResult> {
  const parsed = hideReviewSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;
  const review = await reviewContext(parsed.data.id);
  if (!review) return NOT_FOUND;
  const { user } = await assertCourseAccess(review.courseId, "manage");

  await db.$transaction(async (tx) => {
    await tx.review.update({ where: { id: review.id }, data: { isHidden: parsed.data.value } });
    await recomputeCourseRating(tx, review.courseId);
  });
  await writeAudit({
    actorId: user.id,
    action: "review.hide",
    entity: "Review",
    entityId: review.id,
    before: { isHidden: review.isHidden },
    after: { isHidden: parsed.data.value },
  });
  revalidateReviews(review.courseId, review.course.slug);
  return { ok: true, message: parsed.data.value ? "ซ่อนรีวิวแล้ว — ไม่นับในค่าเฉลี่ย" : "เลิกซ่อนรีวิวแล้ว" };
}
