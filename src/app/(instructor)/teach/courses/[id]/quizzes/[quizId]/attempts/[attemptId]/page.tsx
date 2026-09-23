import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/shared/rich-text";
import { AttemptStatus, QuestionType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { QUESTION_TYPE_LABEL } from "@/features/questions/schemas";
import { AnswerReviewForm } from "@/features/quiz/components/answer-review-form";
import { AnswerReview, verdict } from "@/features/quiz/components/quiz-result";
import { attemptBadge } from "@/features/quiz/lib/attempt";
import { getAttemptReview } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "ตรวจคำตอบ" };

/**
 * M07 · FR-07.4 — คำตอบรายคนของ attempt หนึ่ง + ให้คะแนนอัตนัย/ความเห็นรายข้อ
 * ผู้สอนเห็นเฉลยเสมอ · ไม่ครอบ ProtectedViewer (ผู้สอนเป็นเจ้าของข้อสอบ)
 */
export default async function AttemptReviewPage(
  props: PageProps<"/teach/courses/[id]/quizzes/[quizId]/attempts/[attemptId]">,
) {
  const { id, quizId, attemptId } = await props.params;
  const { attempt, student, quiz, items, pendingCount } = await getAttemptReview(id, quizId, attemptId);
  const inProgress = attempt.status === AttemptStatus.IN_PROGRESS;
  const badge = attemptBadge(attempt);

  return (
    <div className="mx-auto max-w-[820px]">
      <Link
        href={`/teach/courses/${id}/quizzes/${quizId}/results`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> ผลสอบ: {quiz.title}
      </Link>

      <section aria-labelledby="attempt-title" className="bg-card border-border mb-4 rounded-xl border p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 id="attempt-title" className="text-[22px] leading-tight font-bold tracking-[-0.018em]">
              {student.name}
            </h1>
            <p className="text-muted-foreground text-[12.5px] break-all">
              {student.externalId ? `${student.externalId} · ` : ""}
              {student.email}
            </p>
            <p className="text-fg-2 mt-1 text-[13px]">
              {quiz.title} · ครั้งที่ {attempt.attemptNo}
              {attempt.submittedAt ? ` · ส่งเมื่อ ${formatDateTime(attempt.submittedAt)}` : ""}
            </p>
          </div>
          <div className="text-right">
            <Badge className={cn("border-0", badge.tone)}>{badge.label}</Badge>
            {!inProgress ? (
              <p className="mt-1">
                <span data-attempt-score className="text-[22px] font-bold tabular-nums">
                  {formatScore(attempt.score)}/{formatScore(attempt.maxScore)}
                </span>
                <span className="text-fg-2 block text-[12.5px]">
                  {formatScore(attempt.pct)}% · เกณฑ์ผ่าน {quiz.passingPct}%
                </span>
              </p>
            ) : null}
          </div>
        </div>
        {pendingCount > 0 ? (
          <p className="bg-warning-bg text-warning-fg mt-3 rounded-lg px-3 py-2 text-[13px]">
            รอตรวจ {pendingCount} ข้อ — คะแนนรวมและผลผ่าน/ไม่ผ่านจะสรุปเมื่อตรวจครบ แล้วระบบแจ้งผู้เรียนให้เอง
          </p>
        ) : null}
      </section>

      {inProgress ? (
        <p className="bg-card border-border text-fg-2 rounded-xl border px-4 py-3 text-[13px]">
          ผู้เรียนกำลังทำแบบทดสอบนี้อยู่ — ตรวจได้เมื่อส่งแล้วหรือหมดเวลา
        </p>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => {
            const v = verdict(item);
            const essay = item.type === QuestionType.ESSAY;
            return (
              <li key={item.questionId}>
                <section
                  aria-label={`ข้อ ${item.number}`}
                  data-review-question
                  className={cn(
                    "bg-card rounded-xl border p-4 sm:p-5",
                    item.result?.pending ? "border-warning-fg/40" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="text-[14px] font-semibold">ข้อ {item.number}</span>
                    <span className="text-muted-foreground">
                      {QUESTION_TYPE_LABEL[item.type]} · {formatScore(item.points)} คะแนน
                    </span>
                    {v ? <Badge className={cn("ml-auto border-0", v.tone)}>{v.label}</Badge> : null}
                    {item.result?.score !== null && item.result?.score !== undefined ? (
                      <span className="tabular-nums">ได้ {formatScore(item.result.score)}</span>
                    ) : null}
                  </div>
                  <RichText content={item.prompt} className="mt-2 mb-3 space-y-2" />
                  <AnswerReview item={item} owner="ผู้เรียน" />
                  {item.key?.explanation ? (
                    <details className="mt-3 text-[13px]">
                      <summary className="text-muted-foreground min-h-11 cursor-pointer py-2">
                        {essay ? "แนวคำตอบ / คำอธิบาย" : "คำอธิบายเฉลย"}
                      </summary>
                      <RichText content={item.key.explanation} className="space-y-2" />
                    </details>
                  ) : null}
                  <AnswerReviewForm
                    // เปลี่ยน key เมื่อค่าที่บันทึกเปลี่ยน ให้ช่องกรอกรับค่าใหม่หลัง refresh
                    key={`${item.result?.score ?? ""}|${item.result?.feedback ?? ""}`}
                    attemptId={attempt.id}
                    questionId={item.questionId}
                    number={item.number}
                    points={item.points}
                    scorable={essay}
                    score={essay ? (item.result?.score ?? null) : null}
                    feedback={item.result?.feedback ?? null}
                  />
                </section>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
