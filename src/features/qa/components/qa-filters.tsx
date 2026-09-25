"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { QA_FILTERS, QA_FILTER_LABEL, type QaFilter } from "@/features/qa/schemas";

const ALL_LESSONS = "all";

/** ตัวกรองกระทู้ — สถานะ (ลิงก์) + บทเรียน (เลือกแล้วเปลี่ยน URL) · ค่าอยู่ใน URL จึงแชร์/ย้อนกลับได้ */
export function QaFilters({
  basePath,
  filter,
  lessonId,
  lessons,
}: {
  basePath: string;
  filter: QaFilter;
  lessonId: string | null;
  lessons: { id: string; title: string }[];
}) {
  const router = useRouter();
  const href = (next: { filter?: QaFilter; lesson?: string | null }) => {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const l = next.lesson === undefined ? lessonId : next.lesson;
    params.set("filter", f);
    if (l) params.set("lesson", l);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <nav aria-label="กรองตามสถานะ" className="flex flex-wrap gap-1.5">
        {QA_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f })}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-medium",
              f === filter ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border hover:bg-muted",
            )}
          >
            {QA_FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>

      {lessons.length > 0 ? (
        <div className="w-full space-y-1 sm:w-64">
          <Label htmlFor="qa-lesson-filter" className="text-muted-foreground text-[12px]">
            บทเรียน
          </Label>
          <Select
            value={lessonId ?? ALL_LESSONS}
            onValueChange={(value) => router.push(href({ lesson: value === ALL_LESSONS ? null : value }))}
          >
            <SelectTrigger id="qa-lesson-filter" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LESSONS}>ทุกบทเรียน</SelectItem>
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
