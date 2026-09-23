"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Clock, ListChecks, Loader2, Play, RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttemptStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { startAttempt } from "@/features/quiz/actions";
import { SHOW_ANSWERS_LABEL } from "@/features/quiz/lib/attempt";
import type { LessonQuiz } from "@/features/quiz/queries";

function statusBadge(a: LessonQuiz["attempts"][number]) {
  if (a.status === AttemptStatus.IN_PROGRESS) return { label: "กำลังทำ", tone: "bg-info-bg text-info-fg" };
  if (a.passed === null) return { label: "รอตรวจอัตนัย", tone: "bg-warning-bg text-warning-fg" };
  return a.passed
    ? { label: "ผ่าน", tone: "bg-success-bg text-success-fg" }
    : { label: "ไม่ผ่าน", tone: "bg-danger-bg text-danger-fg" };
}

/** M07 · FR-07.5 — การ์ดแบบทดสอบในหน้าเรียน: รายละเอียด ปุ่มเริ่ม/ทำต่อ และประวัติการสอบ */
export function QuizPanel({ lessonId, data }: { lessonId: string; data: LessonQuiz }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const { quiz } = data;

  function start(formData: FormData) {
    startTransition(async () => {
      const result = await startAttempt(formData);
      if (result.ok && result.attemptId) {
        router.push(`/quiz/${result.attemptId}`);
      } else {
        toast.error(result.message);
        router.refresh();
      }
    });
  }

  const facts = [
    { icon: ListChecks, text: `${quiz.questionCount} ข้อ` },
    { icon: Clock, text: quiz.timeLimitMin ? `${quiz.timeLimitMin} นาที` : "ไม่จำกัดเวลา" },
    { icon: Target, text: `ผ่านที่ ${quiz.passingPct}%` },
    {
      icon: RotateCcw,
      text: quiz.maxAttempts
        ? `ใช้ไปแล้ว ${data.attemptsUsed}/${quiz.maxAttempts} ครั้ง`
        : `ทำได้ไม่จำกัดครั้ง (ทำแล้ว ${data.attemptsUsed})`,
    },
  ];

  return (
    <section aria-labelledby="quiz-title" className="bg-card border-border rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="quiz-title" className="text-[16px] font-semibold">
          {quiz.title}
        </h2>
        {data.passed ? (
          <Badge className="bg-success-bg text-success-fg gap-1 border-0">
            <CircleCheckBig className="size-3.5" /> สอบผ่านแล้ว
          </Badge>
        ) : null}
      </div>

      <ul className="text-fg-2 mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2">
            <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden /> {text}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2 text-[12px]">
        {quiz.availableFrom ? `เปิด ${formatDateTime(quiz.availableFrom)} · ` : ""}
        {quiz.availableUntil ? `ปิด ${formatDateTime(quiz.availableUntil)} · ` : ""}
        แสดงเฉลย{SHOW_ANSWERS_LABEL[quiz.showAnswers]}
        {data.bestPct !== null ? ` · คะแนนดีที่สุด ${formatScore(data.bestPct)}%` : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {data.inProgressId ? (
          <Button asChild>
            <Link href={`/quiz/${data.inProgressId}`}>
              <Play className="size-4" /> ทำต่อ
            </Link>
          </Button>
        ) : (
          <form onSubmit={submitForm(start)}>
            <input type="hidden" name="lessonId" value={lessonId} />
            <Button type="submit" disabled={pending || data.blocked !== null}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {data.attemptsUsed > 0 ? "ทำอีกครั้ง" : "เริ่มทำแบบทดสอบ"}
            </Button>
          </form>
        )}
        {data.blocked && !data.inProgressId ? (
          <p className="text-muted-foreground text-[12.5px]">{data.blocked}</p>
        ) : null}
      </div>

      {data.attempts.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold">ประวัติการสอบ</h3>
          <ul className="border-border divide-line divide-y rounded-lg border">
            {data.attempts.map((a) => {
              const badge = statusBadge(a);
              return (
                <li key={a.id} data-attempt className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
                  <span className="w-16 shrink-0">ครั้งที่ {a.attemptNo}</span>
                  <span className="min-w-0 flex-1 tabular-nums">
                    {a.score !== null && a.maxScore
                      ? `${formatScore(a.score)}/${formatScore(a.maxScore)} คะแนน`
                      : "–"}
                  </span>
                  <Badge className={cn("border-0", badge.tone)}>{badge.label}</Badge>
                  <Button asChild variant="ghost" size="sm" className="min-h-11">
                    <Link href={`/quiz/${a.id}`}>
                      {a.status === AttemptStatus.IN_PROGRESS ? "ทำต่อ" : "ดูผล"}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
