import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, MessageSquareQuote, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { RatingStars } from "@/features/catalog/components/course-card";
import { HideReviewButton } from "@/features/reviews/components/review-list";
import { getAdminReviews } from "@/features/reviews/queries";
import { ADMIN_REVIEW_FILTERS, type AdminReviewFilter } from "@/features/reviews/schemas";
import { QaPager } from "@/features/qa/components/qa-pager";

export const metadata: Metadata = { title: "รีวิวคอร์ส" };

const FILTER_LABEL: Record<AdminReviewFilter, string> = { all: "ทั้งหมด", hidden: "ถูกซ่อน" };

/** M14 · FR-14.3 — ซ่อน/เลิกซ่อนรีวิว (ผู้ดูแลคณะเห็นเฉพาะคอร์สของคณะตัวเอง) */
export default async function AdminReviewsPage(props: PageProps<"/admin/reviews">) {
  const search = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = (one(search.q) ?? "").slice(0, 100);
  const filter: AdminReviewFilter = one(search.filter) === "hidden" ? "hidden" : "all";
  const page = Math.max(1, Number.parseInt(one(search.page) ?? "1", 10) || 1);
  const data = await getAdminReviews({ filter, q, page });
  const params = { filter, ...(q ? { q } : {}) };

  return (
    <>
      <PageHeader
        title="รีวิวคอร์ส"
        description="รีวิวที่ถูกซ่อนจะไม่แสดงต่อผู้เรียนและไม่นับในคะแนนเฉลี่ยของคอร์ส · ผู้สอนตอบกลับได้ที่หน้าคอร์ส"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="กรองรีวิว" className="flex gap-1.5">
          {ADMIN_REVIEW_FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/reviews?${new URLSearchParams({ filter: f, ...(q ? { q } : {}) })}`}
              aria-current={f === filter ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-medium",
                f === filter ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border hover:bg-muted",
              )}
            >
              {FILTER_LABEL[f]}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex w-full gap-2 sm:w-auto sm:flex-1">
          <input type="hidden" name="filter" value={filter} />
          <Input
            name="q"
            defaultValue={q}
            placeholder="ค้นหาข้อความ ชื่อผู้รีวิว หรือชื่อคอร์ส"
            aria-label="ค้นหารีวิว"
            className="bg-card h-11 min-w-0 flex-1 sm:max-w-[420px]"
          />
          <Button type="submit" variant="outline" className="h-11">
            <Search className="size-4" /> ค้นหา
          </Button>
        </form>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="size-5" />}
          title={q || filter === "hidden" ? "ไม่พบรีวิวที่ตรงกับเงื่อนไข" : "ยังไม่มีรีวิว"}
          description="ผู้เรียนรีวิวคอร์สได้เมื่อเรียนไปแล้วอย่างน้อย 30%"
        />
      ) : (
        <ul className="space-y-3">
          {data.rows.map((r) => (
            <li key={r.id}>
              <article
                data-admin-review
                aria-label={`รีวิวของ ${r.user.name} ในคอร์ส ${r.course.title}`}
                className="bg-card border-border flex flex-wrap items-start gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span role="img" aria-label={`${r.rating} ดาว`}>
                      <RatingStars value={r.rating} />
                    </span>
                    <span className="text-[13.5px] font-medium">{r.user.name}</span>
                    <span className="text-muted-foreground text-[12px] break-all">({r.user.email})</span>
                    {r.isHidden ? (
                      <Badge variant="secondary" className="bg-warning-bg text-warning-fg">
                        <EyeOff className="size-3" aria-hidden /> ถูกซ่อน
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-fg-2 mt-1 text-[12.5px]">
                    <Link href={`/courses/${r.course.slug}#course-reviews`} className="hover:underline">
                      {r.course.title}
                    </Link>{" "}
                    · {formatDate(r.createdAt)}
                  </p>
                  {r.comment ? (
                    <p className="mt-2 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">{r.comment}</p>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-[12.5px]">ไม่มีความคิดเห็น</p>
                  )}
                  {r.reply ? (
                    <p className="text-muted-foreground mt-2 text-[12.5px] break-words whitespace-pre-wrap">
                      ผู้สอนตอบ: {r.reply}
                    </p>
                  ) : null}
                </div>
                <HideReviewButton id={r.id} hidden={r.isHidden} />
              </article>
            </li>
          ))}
        </ul>
      )}
      <QaPager basePath="/admin/reviews" params={params} page={page} pageCount={data.pageCount} />
    </>
  );
}
