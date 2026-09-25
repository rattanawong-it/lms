import { RatingStars } from "@/features/catalog/components/course-card";
import type { RatingSummary as Summary } from "@/features/reviews/lib/rules";

/** FR-14.2 — ค่าเฉลี่ย + การกระจาย 5 → 1 ดาว */
export function RatingSummary({ summary }: { summary: Summary }) {
  return (
    <div className="bg-card border-border flex flex-wrap items-center gap-5 rounded-xl border p-4 sm:p-5">
      <div className="text-center">
        <p data-rating-avg className="num text-[36px] leading-none font-bold">
          {summary.avg === null ? "–" : summary.avg.toFixed(1)}
        </p>
        <div className="mt-2 flex justify-center">
          <RatingStars value={summary.avg ?? 0} size={15} />
        </div>
        <p data-rating-count className="text-muted-foreground mt-1 text-[12px]">
          {summary.count.toLocaleString("th-TH")} รีวิว
        </p>
      </div>
      <ul aria-label="การกระจายของดาว" className="min-w-[200px] flex-1 space-y-1.5">
        {summary.distribution.map((d) => (
          <li key={d.stars} className="flex items-center gap-2 text-[12.5px]">
            <span className="num w-10 shrink-0">{d.stars} ดาว</span>
            <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
              <span className="bg-warning-fg block h-full rounded-full" style={{ width: `${d.pct}%` }} />
            </span>
            <span className="num text-muted-foreground w-16 shrink-0 text-right">
              {d.count.toLocaleString("th-TH")} ({d.pct}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
