import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * FR-14.2 · phase-3-plan §4 S4 — คำนวณ `Course.ratingAvg/ratingCount` ใหม่จากแถวจริง
 * เรียกใน transaction เดียวกับการเขียน/ซ่อนรีวิวเสมอ (ไม่บวกลบสะสม ค่าจึงไม่เพี้ยนจากข้อมูลจริง)
 */
export async function recomputeCourseRating(tx: Prisma.TransactionClient, courseId: string): Promise<void> {
  // ล็อกแถวคอร์สก่อนนับ — รีวิวสองรายการเข้ามาพร้อมกันจะนับทีละรายการ ไม่ทับค่ากันด้วยผลที่ขาดอีกแถว
  await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} FOR UPDATE`;
  const agg = await tx.review.aggregate({
    where: { courseId, isHidden: false },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  await tx.course.update({
    where: { id: courseId },
    data: {
      ratingCount: count,
      ratingAvg: count === 0 || agg._avg.rating === null ? null : Math.round(agg._avg.rating * 100) / 100,
    },
  });
}
