import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { getGradingQueue } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "ตรวจข้ออัตนัย" };

/** M07 · FR-07.4 — คิวข้ออัตนัยรอตรวจของทั้งคอร์ส (ส่งก่อนตรวจก่อน) */
export default async function GradingQueuePage(props: PageProps<"/teach/courses/[id]/quizzes/review">) {
  const { id } = await props.params;
  const { course, queue } = await getGradingQueue(id);
  const base = `/teach/courses/${id}/quizzes`;

  return (
    <>
      <Link
        href={base}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> แบบทดสอบทั้งหมด
      </Link>
      <PageHeader
        title="ตรวจข้ออัตนัย"
        description={`${course.title} · ${queue.length ? `รอตรวจ ${queue.length} ครั้ง เรียงจากส่งก่อน` : "ไม่มีงานค้าง"}`}
      />

      {queue.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="ตรวจครบแล้ว"
          description="เมื่อผู้เรียนส่งแบบทดสอบที่มีข้ออัตนัย รายการจะมาอยู่ที่นี่"
        />
      ) : (
        <ul className="space-y-3">
          {queue.map((a) => (
            <li key={a.id}>
              <article
                aria-label={`${a.student.name} · ${a.quiz.title}`}
                data-queue-item
                className="bg-card border-border flex flex-wrap items-center gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold">{a.student.name}</h2>
                  <p className="text-fg-2 text-[13px]">
                    {a.quiz.title} · ครั้งที่ {a.attemptNo} · รอตรวจ {a.pendingCount} ข้อ
                  </p>
                  {a.submittedAt ? (
                    <p className="text-muted-foreground text-[12px]">
                      ส่งเมื่อ {formatDateTime(a.submittedAt)} ({formatRelative(a.submittedAt)})
                    </p>
                  ) : null}
                </div>
                <Button asChild className="min-h-11">
                  <Link href={`${base}/${a.quiz.id}/attempts/${a.id}`}>ตรวจ</Link>
                </Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
