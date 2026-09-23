import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { getAssignmentQueue } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "งานรอตรวจ" };

/** M08 · FR-08.5 — คิวงานรอตรวจของทั้งคอร์ส (ส่งก่อนตรวจก่อน) */
export default async function AssignmentQueuePage(props: PageProps<"/teach/courses/[id]/assignments/review">) {
  const { id } = await props.params;
  const { course, queue } = await getAssignmentQueue(id);
  const base = `/teach/courses/${id}/assignments`;

  return (
    <>
      <Link
        href={base}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> งานทั้งหมด
      </Link>
      <PageHeader
        title="งานรอตรวจ"
        description={`${course.title} · ${queue.length ? `รอตรวจ ${queue.length} งาน เรียงจากส่งก่อน` : "ไม่มีงานค้าง"}`}
      />

      {queue.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="ตรวจครบแล้ว"
          description="เมื่อผู้เรียนส่งงาน รายการจะมาอยู่ที่นี่"
        />
      ) : (
        <ul className="space-y-3">
          {queue.map((s) => (
            <li key={s.id}>
              <article
                aria-label={`${s.student.name} · ${s.assignment.title}`}
                data-queue-item
                className="bg-card border-border flex flex-wrap items-center gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold">{s.student.name}</h2>
                  <p className="text-fg-2 text-[13px]">
                    {s.assignment.title} · ครั้งที่ {s.attemptNo}
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    ส่งเมื่อ {formatDateTime(s.submittedAt)} ({formatRelative(s.submittedAt)})
                  </p>
                </div>
                {s.isLate ? <Badge className="bg-danger-bg text-danger-fg border-0">ส่งช้า</Badge> : null}
                <Button asChild className="min-h-11">
                  <Link href={`${base}/${s.assignment.id}/submissions/${s.id}`}>ตรวจ</Link>
                </Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
