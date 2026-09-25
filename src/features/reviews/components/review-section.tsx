import { MessageSquareQuote } from "lucide-react";
import { getCourseReviews } from "@/features/reviews/queries";
import { REVIEW_MIN_PROGRESS } from "@/features/reviews/schemas";
import { RatingSummary } from "@/features/reviews/components/rating-summary";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { ReviewList } from "@/features/reviews/components/review-list";

/**
 * M14 — ส่วนรีวิวของหน้ารายละเอียดคอร์ส
 * ผู้เรียกต้องตรวจการมองเห็นของคอร์สมาแล้ว (`getCourseBySlug()`)
 */
export async function ReviewSection({ course }: { course: { id: string; departmentId: string | null } }) {
  const data = await getCourseReviews(course);
  const { eligibility } = data;

  return (
    <section aria-labelledby="course-reviews" className="mt-8 space-y-3">
      <h2 id="course-reviews" className="text-[17px] font-semibold">
        รีวิวจากผู้เรียน
      </h2>

      {data.summary.count > 0 ? <RatingSummary summary={data.summary} /> : null}

      {eligibility?.ok ? (
        <ReviewForm courseId={course.id} initial={data.mine} />
      ) : eligibility && eligibility.reason === "progress" ? (
        <p className="bg-card border-border text-muted-foreground rounded-xl border px-4 py-3 text-[13px]">
          รีวิวได้เมื่อเรียนไปแล้วอย่างน้อย {REVIEW_MIN_PROGRESS}% · ตอนนี้คุณเรียนไปแล้ว{" "}
          <span className="num">{eligibility.progressPct}%</span>
        </p>
      ) : null}

      {data.reviews.length === 0 ? (
        <div className="bg-card border-border text-muted-foreground flex items-center gap-3 rounded-xl border px-4 py-5 text-[13px]">
          <MessageSquareQuote className="size-5 shrink-0" />
          <p>ยังไม่มีรีวิว — ผู้เรียนรีวิวได้เมื่อเรียนไปแล้วอย่างน้อย {REVIEW_MIN_PROGRESS}%</p>
        </div>
      ) : (
        <ReviewList reviews={data.reviews} canReply={data.canReply} canModerate={data.canModerate} />
      )}
    </section>
  );
}
