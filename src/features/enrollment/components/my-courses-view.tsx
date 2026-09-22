"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, CircleCheckBig, Clock, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { cancelEnrollRequest } from "@/features/enrollment/actions";
import { ENROLLMENT_STATUS_LABEL } from "@/features/enrollment/lib/labels";
import type { MyCourseBucket, MyCourseRow, MyCourses } from "@/features/enrollment/queries";
import { formatDate } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";

/** M06 · FR-06.6 — คอร์สของฉัน แยกเป็น กำลังเรียน / เรียนจบ / หมดอายุ */

const TABS: { key: Exclude<MyCourseBucket, "pending">; label: string }[] = [
  { key: "active", label: "กำลังเรียน" },
  { key: "completed", label: "เรียนจบ" },
  { key: "expired", label: "หมดอายุ" },
];

const EMPTY: Record<Exclude<MyCourseBucket, "pending">, { title: string; description: string }> = {
  active: {
    title: "ยังไม่มีคอร์สที่กำลังเรียน",
    description: "เลือกคอร์สจากคลังคอร์สแล้วกดลงทะเบียนเพื่อเริ่มเรียน",
  },
  completed: {
    title: "ยังไม่มีคอร์สที่เรียนจบ",
    description: "เมื่อเรียนครบตามเงื่อนไขของคอร์ส คอร์สนั้นจะมาอยู่ที่นี่",
  },
  expired: {
    title: "ไม่มีคอร์สที่หมดอายุ",
    description: "คอร์สที่ผู้สอนกำหนดวันหมดสิทธิ์ไว้และเลยกำหนดแล้วจะแสดงที่นี่",
  },
};

function CourseCard({ row, bucket }: { row: MyCourseRow; bucket: MyCourseBucket }) {
  const locked = bucket === "expired";

  return (
    <li className="bg-card border-border overflow-hidden rounded-xl border">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="bg-muted relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg sm:w-[180px]">
          {row.coverUrl ? (
            <Image
              src={row.coverUrl}
              alt=""
              fill
              sizes="180px"
              className={cn("object-cover", locked && "opacity-60 grayscale")}
            />
          ) : (
            <div className="from-accent to-muted flex h-full w-full items-center justify-center bg-gradient-to-br">
              <span className="text-accent-foreground/70 text-[26px] font-bold">
                {row.title.slice(0, 1)}
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
              <Link href={`/courses/${row.slug}`} className="hover:underline">
                {row.title}
              </Link>
            </h3>
            <Badge variant="secondary" className="shrink-0">
              {ENROLLMENT_STATUS_LABEL[row.status]}
            </Badge>
          </div>

          {row.instructorNames.length > 0 ? (
            <p className="text-muted-foreground mt-1 truncate text-[12.5px]">
              ผู้สอน: {row.instructorNames.join(", ")}
            </p>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground num">
                เรียนแล้ว {row.completedLessons}/{row.lessonCount} บทเรียน
              </span>
              <span className="num font-medium">{row.progressPct}%</span>
            </div>
            <Progress
              value={row.progressPct}
              aria-label={`${row.title} เรียนไปแล้ว ${row.progressPct} เปอร์เซ็นต์`}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground num text-[11.5px]">
              {row.completedAt ? (
                <span className="text-success-fg inline-flex items-center gap-1 font-medium">
                  <CircleCheckBig className="size-3.5" /> จบเมื่อ {formatDate(row.completedAt)}
                </span>
              ) : row.expiresAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {locked ? "หมดสิทธิ์เมื่อ" : "เรียนได้ถึง"} {formatDate(row.expiresAt)}
                </span>
              ) : (
                <>ลงทะเบียนเมื่อ {formatDate(row.enrolledAt)}</>
              )}
            </p>

            {locked ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/courses/${row.slug}`}>ขอสิทธิ์เรียนอีกครั้ง</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={`/learn/${row.courseId}`}>
                  {row.progressPct === 0
                    ? "เริ่มเรียน"
                    : row.status === "COMPLETED"
                      ? "ทบทวน"
                      : "เรียนต่อ"}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function MyCoursesView({ courses }: { courses: MyCourses }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Exclude<MyCourseBucket, "pending">>("active");
  const [pending, startTransition] = React.useTransition();

  function cancel(formData: FormData) {
    startTransition(async () => {
      const result = await cancelEnrollRequest(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const rows = courses[tab];

  return (
    <div className="space-y-5">
      {courses.pending.length > 0 ? (
        <section
          aria-labelledby="pending-requests"
          className="bg-warning-bg rounded-xl px-4 py-3.5"
        >
          <h2 id="pending-requests" className="text-warning-fg text-[13px] font-semibold">
            คำขอลงทะเบียนที่รออนุมัติ ({courses.pending.length})
          </h2>
          <ul className="mt-2.5 space-y-2">
            {courses.pending.map((row) => (
              <li key={row.enrollmentId} className="flex items-center gap-3">
                <Link
                  href={`/courses/${row.slug}`}
                  className="text-warning-fg min-w-0 flex-1 truncate text-[13px] font-medium hover:underline"
                >
                  {row.title}
                </Link>
                <span className="text-warning-fg/80 num shrink-0 text-[11.5px]">
                  ส่งคำขอ {formatDate(row.enrolledAt)}
                </span>
                <form onSubmit={submitForm(cancel)} className="shrink-0">
                  <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                  <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    ยกเลิก
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        role="tablist"
        aria-label="สถานะคอร์สของฉัน"
        className="border-line flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              id={`tab-${item.key}`}
              aria-selected={active}
              aria-controls={`panel-${item.key}`}
              onClick={() => setTab(item.key)}
              className={cn(
                "flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-primary"
                  : "text-fg-3 hover:text-foreground border-transparent",
              )}
            >
              {item.label}
              <span className="bg-muted text-fg-3 num rounded-full px-1.5 text-[11px]">
                {courses[item.key].length}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={tab === "completed" ? <GraduationCap /> : <BookOpen />}
            title={EMPTY[tab].title}
            description={EMPTY[tab].description}
            action={
              tab === "active" ? (
                <Button asChild>
                  <Link href="/courses">ไปที่คลังคอร์ส</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <CourseCard key={row.enrollmentId} row={row} bucket={tab} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
