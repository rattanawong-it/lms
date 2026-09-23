import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Download, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/shared/rich-text";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { SUBMISSION_STATUS_BADGE } from "@/features/assignments/lib/rules";
import { GradeSubmissionForm } from "@/features/assignments/components/grade-submission-form";
import { getSubmissionReview } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "ตรวจงาน" };

/** M08 · FR-08.4 — ดูงานที่ส่ง เปิดไฟล์ ให้คะแนน/ความเห็น หรือส่งกลับให้แก้ */
export default async function SubmissionReviewPage(
  props: PageProps<"/teach/courses/[id]/assignments/[assignmentId]/submissions/[submissionId]">,
) {
  const { id, assignmentId, submissionId } = await props.params;
  const { submission, history, isLatest } = await getSubmissionReview(id, assignmentId, submissionId);
  const { assignment, user: student } = submission;
  const badge = SUBMISSION_STATUS_BADGE[submission.status];
  const base = `/teach/courses/${id}/assignments/${assignmentId}/submissions`;

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <Link
        href={base}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> งานที่ส่ง: {assignment.title}
      </Link>

      <section aria-labelledby="submission-title" className="bg-card border-border rounded-xl border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 id="submission-title" className="text-[22px] leading-tight font-bold tracking-[-0.018em]">
              {student.name}
            </h1>
            <p className="text-muted-foreground text-[12.5px] break-all">
              {student.externalId ? `${student.externalId} · ` : ""}
              {student.email}
            </p>
            <p className="text-fg-2 mt-1 text-[13px]">
              ครั้งที่ {submission.attemptNo} · ส่งเมื่อ {formatDateTime(submission.submittedAt)}
              {assignment.dueAt ? ` · กำหนดส่ง ${formatDateTime(assignment.dueAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {submission.isLate ? <Badge className="bg-danger-bg text-danger-fg border-0">ส่งช้า</Badge> : null}
            <Badge className={cn("border-0", badge.tone)}>{badge.label}</Badge>
          </div>
        </div>
      </section>

      <section aria-labelledby="submission-content" className="bg-card border-border space-y-3 rounded-xl border p-5">
        <h2 id="submission-content" className="text-[15px] font-semibold">
          สิ่งที่ส่ง
        </h2>
        {submission.text ? (
          <p data-submission-text className="bg-muted rounded-lg px-3 py-2 text-[13.5px] whitespace-pre-wrap">
            {submission.text}
          </p>
        ) : (
          <p className="text-muted-foreground text-[13px]">(ไม่มีข้อความ)</p>
        )}
        {submission.files.length ? (
          <ul className="border-border divide-line divide-y rounded-lg border">
            {submission.files.map((f) => (
              <li key={f.assetId} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.originalName}</span>
                <span className="text-muted-foreground shrink-0 text-[11.5px]">{f.sizeLabel}</span>
                <a
                  href={`/api/submission-file/${f.assetId}`}
                  className="text-primary inline-flex min-h-11 shrink-0 items-center gap-1 hover:underline"
                  aria-label={`เปิดไฟล์ ${f.originalName}`}
                >
                  <Download className="size-4" aria-hidden /> เปิด
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="grade-title" className="bg-card border-border rounded-xl border p-5">
        <h2 id="grade-title" className="mb-3 text-[15px] font-semibold">
          ผลการตรวจ
          {submission.score !== null ? (
            <span data-submission-score className="text-fg-2 ml-2 font-normal tabular-nums">
              {formatScore(submission.score)}/{formatScore(assignment.maxScore)}
            </span>
          ) : null}
        </h2>
        {isLatest ? (
          <GradeSubmissionForm
            // เปลี่ยน key เมื่อค่าที่บันทึกเปลี่ยน ให้ช่องกรอกรับค่าใหม่หลัง refresh
            key={`${submission.status}|${submission.score ?? ""}|${submission.feedback ?? ""}`}
            submissionId={submission.id}
            maxScore={assignment.maxScore}
            score={submission.score}
            feedback={submission.feedback}
          />
        ) : (
          <div className="text-fg-2 space-y-2 text-[13px]">
            <p>นี่คือการส่งครั้งก่อน — ตรวจได้เฉพาะครั้งล่าสุด</p>
            {submission.feedback ? <p className="whitespace-pre-wrap">ความเห็น: {submission.feedback}</p> : null}
          </div>
        )}
      </section>

      {history.length > 1 ? (
        <section aria-labelledby="history-title" className="bg-card border-border rounded-xl border p-5">
          <h2 id="history-title" className="mb-2 text-[15px] font-semibold">
            ประวัติการส่งของผู้เรียนคนนี้
          </h2>
          <ol className="border-border divide-line divide-y rounded-lg border">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-1 text-[13px]">
                <Link
                  href={`${base}/${h.id}`}
                  aria-current={h.id === submission.id ? "page" : undefined}
                  className={cn("inline-flex min-h-11 items-center hover:underline", h.id === submission.id && "font-semibold")}
                >
                  ครั้งที่ {h.attemptNo}
                </Link>
                <span className="text-muted-foreground">{formatDateTime(h.submittedAt)}</span>
                {h.isLate ? <Badge className="bg-danger-bg text-danger-fg border-0">ส่งช้า</Badge> : null}
                <Badge className={cn("ml-auto border-0", SUBMISSION_STATUS_BADGE[h.status].tone)}>
                  {SUBMISSION_STATUS_BADGE[h.status].label}
                </Badge>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="bg-card border-border rounded-xl border px-5 py-3">
        <summary className="min-h-11 cursor-pointer py-2 text-[14px] font-semibold">คำสั่งงาน</summary>
        <RichText content={assignment.instructions} className="mt-2 space-y-2" />
      </details>
    </div>
  );
}
