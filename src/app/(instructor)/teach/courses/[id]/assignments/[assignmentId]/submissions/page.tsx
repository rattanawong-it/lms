import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SubmissionStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { SUBMISSION_STATUS_BADGE } from "@/features/assignments/lib/rules";
import { getAssignmentSubmissions } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "งานที่ส่ง" };

/**
 * M08 · FR-08.4 — งานที่ส่งของงานหนึ่ง: ส่งล่าสุดของแต่ละคน (รอตรวจขึ้นก่อน) + คนที่ยังไม่ส่ง
 * การ์ดรายคนทุกขนาดจอ (ตารางกว้างทำให้มือถือย่อทั้งหน้า — CLAUDE.md §6)
 */
export default async function AssignmentSubmissionsPage(
  props: PageProps<"/teach/courses/[id]/assignments/[assignmentId]/submissions">,
) {
  const { id, assignmentId } = await props.params;
  const { assignment, latest, missing, summary } = await getAssignmentSubmissions(id, assignmentId);
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
        title={`งานที่ส่ง: ${assignment.title}`}
        description={`${assignment.course.title} · ${assignment.dueAt ? `กำหนดส่ง ${formatDateTime(assignment.dueAt)}` : "ไม่มีกำหนดส่ง"} · คะแนนเต็ม ${formatScore(assignment.maxScore)}`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="ส่งแล้ว" value={`${summary.submitted} คน`} tone="primary" />
        <StatCard label="รอตรวจ" value={`${summary.pending} คน`} tone="warning" />
        <StatCard label="ส่งช้า" value={`${summary.late} คน`} tone="danger" />
        <StatCard label="ยังไม่ส่ง" value={`${summary.missing} คน`} tone="quiz" />
      </div>

      {latest.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="ยังไม่มีผู้ส่งงาน"
          description="งานที่ผู้เรียนส่งจะแสดงที่นี่ พร้อมป้าย “ส่งช้า” เมื่อส่งหลังกำหนด"
        />
      ) : (
        <ul className="space-y-3">
          {latest.map((s) => {
            const badge = SUBMISSION_STATUS_BADGE[s.status];
            return (
              <li key={s.id}>
                <article
                  aria-label={s.student.name}
                  data-submission-row
                  className="bg-card border-border flex flex-wrap items-center gap-3 rounded-xl border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-semibold">{s.student.name}</h2>
                    <p className="text-muted-foreground text-[12.5px] break-all">
                      {s.student.externalId ? `${s.student.externalId} · ` : ""}
                      {s.student.email}
                    </p>
                    <p className="text-fg-2 mt-1 text-[12.5px]">
                      ครั้งที่ {s.attemptNo} · {formatDateTime(s.submittedAt)} · ไฟล์ {s.fileCount} ไฟล์
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.isLate ? <Badge className="bg-danger-bg text-danger-fg border-0">ส่งช้า</Badge> : null}
                    <Badge className={cn("border-0", badge.tone)}>{badge.label}</Badge>
                    {s.score !== null ? (
                      <span className="text-[13px] tabular-nums">
                        {formatScore(s.score)}/{formatScore(assignment.maxScore)}
                      </span>
                    ) : null}
                    <Button
                      asChild
                      size="sm"
                      variant={s.status === SubmissionStatus.SUBMITTED ? "default" : "outline"}
                      className="min-h-11"
                    >
                      <Link href={`${base}/${assignment.id}/submissions/${s.id}`} aria-label={`ตรวจงานของ ${s.student.name}`}>
                        {s.status === SubmissionStatus.SUBMITTED ? "ตรวจ" : "ดู / แก้คะแนน"}
                      </Link>
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 ? (
        <section aria-labelledby="missing-title" className="bg-card border-border mt-5 rounded-xl border p-4">
          <h2 id="missing-title" className="text-[14px] font-semibold">
            ยังไม่ส่ง ({missing.length} คน)
          </h2>
          <ul className="text-fg-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {missing.map((u) => (
              <li key={u.id}>{u.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
