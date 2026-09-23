import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Inbox, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { AttemptStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { attemptBadge } from "@/features/quiz/lib/attempt";
import { getQuizResults } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "ผลสอบ" };

/**
 * M07 · FR-07.4 — ผลสอบของแบบทดสอบ: ผู้สอบ × ครั้งที่สอบ × คะแนน
 * แสดงเป็นการ์ดรายคนทุกขนาดจอ (ตารางกว้างทำให้มือถือย่อทั้งหน้า — CLAUDE.md §6)
 */
export default async function QuizResultsPage(props: PageProps<"/teach/courses/[id]/quizzes/[quizId]/results">) {
  const { id, quizId } = await props.params;
  const { quiz, students, summary } = await getQuizResults(id, quizId);
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
        title={`ผลสอบ: ${quiz.title}`}
        description={`${quiz.course.title} · เกณฑ์ผ่าน ${quiz.passingPct}% · นับคะแนนครั้งที่สูงสุด`}
        actions={
          summary.pending > 0 ? (
            <Button asChild>
              <Link href={`${base}/review`}>
                <Inbox className="size-4" /> ตรวจอัตนัย ({summary.pending})
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="ผู้สอบ" value={`${summary.students} คน`} tone="primary" />
        <StatCard label="สอบผ่าน" value={`${summary.passed} คน`} tone="success" />
        <StatCard label="รอตรวจอัตนัย" value={`${summary.pending} ครั้ง`} tone="warning" />
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="ยังไม่มีผู้สอบ"
          description="ผลสอบจะแสดงที่นี่เมื่อผู้เรียนเริ่มทำแบบทดสอบ"
        />
      ) : (
        <ul className="space-y-3">
          {students.map(({ student, attempts, bestPct, passed, pending }) => (
            <li key={student.id}>
              <article
                aria-label={student.name}
                data-student-result
                className="bg-card border-border rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold">{student.name}</h2>
                    <p className="text-muted-foreground text-[12.5px] break-all">
                      {student.externalId ? `${student.externalId} · ` : ""}
                      {student.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pending ? (
                      <Badge className="bg-warning-bg text-warning-fg border-0">มีข้อรอตรวจ</Badge>
                    ) : null}
                    {passed ? <Badge className="bg-success-bg text-success-fg border-0">ผ่านแล้ว</Badge> : null}
                    <span className="text-[13px] tabular-nums">
                      คะแนนที่นับ <strong>{bestPct === null ? "–" : `${formatScore(bestPct)}%`}</strong>
                    </span>
                  </div>
                </div>

                <ul className="divide-line border-line mt-3 divide-y rounded-lg border">
                  {attempts.map((a) => {
                    const badge = attemptBadge(a);
                    return (
                      <li key={a.id} data-attempt className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[13px]">
                        <span className="w-16 shrink-0">ครั้งที่ {a.attemptNo}</span>
                        <span className="min-w-0 flex-1 tabular-nums">
                          {a.status === AttemptStatus.IN_PROGRESS
                            ? "กำลังทำ"
                            : `${formatScore(a.score)}/${formatScore(a.maxScore)} (${formatScore(a.pct)}%)`}
                          {a.submittedAt ? (
                            <span className="text-muted-foreground"> · {formatDateTime(a.submittedAt)}</span>
                          ) : null}
                        </span>
                        <Badge className={cn("border-0", badge.tone)}>{badge.label}</Badge>
                        <Button asChild variant="ghost" size="sm" className="min-h-11">
                          <Link
                            href={`${base}/${quiz.id}/attempts/${a.id}`}
                            aria-label={`${a.status === AttemptStatus.SUBMITTED ? "ตรวจ" : "ดูคำตอบ"} ครั้งที่ ${a.attemptNo} ของ ${student.name}`}
                          >
                            {a.status === AttemptStatus.SUBMITTED ? "ตรวจ" : "ดูคำตอบ"}
                          </Link>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
