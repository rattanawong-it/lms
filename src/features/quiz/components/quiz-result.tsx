import Link from "next/link";
import { Check, CircleCheckBig, CircleX, Hourglass, MessageSquare, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/shared/rich-text";
import { QuestionType, ShowAnswers } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { QUESTION_TYPE_LABEL } from "@/features/questions/schemas";
import type { AttemptItem as Item, AttemptView } from "@/features/quiz/queries";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** คำตอบของผู้เรียน (และเฉลยเมื่อเปิดได้) ของข้อหนึ่ง — ใช้ร่วมกับหน้าตรวจของผู้สอน */
export function AnswerReview({ item, owner = "คุณ" }: { item: Item; owner?: string }) {
  const response = asRecord(item.response);
  const key = item.key;

  if (item.type === QuestionType.SHORT_TEXT || item.type === QuestionType.ESSAY) {
    const text = typeof response.text === "string" && response.text.trim() ? response.text : null;
    return (
      <div className="space-y-2 text-[13.5px]">
        <p className={cn("rounded-lg px-3 py-2 whitespace-pre-wrap", text ? "bg-muted" : "text-muted-foreground")}>
          {text ?? "(ไม่ได้ตอบ)"}
        </p>
        {key && item.type === QuestionType.SHORT_TEXT ? (
          <p className="text-success-fg">คำตอบที่ยอมรับ: {key.accepted.join(" · ")}</p>
        ) : null}
      </div>
    );
  }

  if (item.type === QuestionType.MATCHING) {
    const pairs = asRecord(response.pairs);
    return (
      <ul className="space-y-1.5 text-[13.5px]">
        {item.choices.map((c) => {
          const mine = typeof pairs[c.id] === "string" ? (pairs[c.id] as string) : null;
          const correct = key?.pairs[c.id];
          const right = key ? mine === correct : null;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-x-2">
              <span>{c.text}</span>
              <span className="text-muted-foreground">→</span>
              <span className={cn(right === false && "text-danger-fg line-through", right && "text-success-fg")}>
                {mine ?? "(ไม่ได้จับคู่)"}
              </span>
              {key && !right ? <span className="text-success-fg">({correct})</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }

  const picked = new Set(
    typeof response.choiceId === "string"
      ? [response.choiceId]
      : Array.isArray(response.choiceIds)
        ? (response.choiceIds as string[])
        : [],
  );
  const correct = new Set(key?.correctChoiceIds ?? []);
  return (
    <ul className="space-y-1.5 text-[13.5px]">
      {item.choices.map((c) => {
        const mine = picked.has(c.id);
        const isKey = correct.has(c.id);
        return (
          <li
            key={c.id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2",
              mine ? "border-primary" : "border-border",
              key && isKey && "bg-success-bg",
              key && mine && !isKey && "bg-danger-bg",
            )}
          >
            {key && isKey ? (
              <Check className="text-success-fg size-4 shrink-0" aria-label="คำตอบที่ถูก" />
            ) : key && mine ? (
              <X className="text-danger-fg size-4 shrink-0" aria-label="ตอบผิด" />
            ) : (
              <span className="size-4 shrink-0" aria-hidden />
            )}
            <span className="flex-1">{c.text}</span>
            {mine ? <span className="text-muted-foreground text-[11.5px]">คำตอบของ{owner}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function verdict(item: Item) {
  if (!item.result) return null;
  if (item.result.pending) return { label: "รอตรวจ", tone: "bg-warning-bg text-warning-fg" };
  if (item.type === QuestionType.ESSAY && item.result.score !== null) {
    return { label: "ตรวจแล้ว", tone: "bg-info-bg text-info-fg" };
  }
  if (item.result.isCorrect === null) return null;
  if (item.result.isCorrect) return { label: "ถูก", tone: "bg-success-bg text-success-fg" };
  if ((item.result.score ?? 0) > 0) return { label: "ได้บางส่วน", tone: "bg-warning-bg text-warning-fg" };
  return { label: "ผิด", tone: "bg-danger-bg text-danger-fg" };
}

/** M07 · FR-07.4 / FR-07.6 — ผลสอบหลังส่ง · เฉลยแสดงตามการตั้งค่า */
export function QuizResult({ view, backHref }: { view: AttemptView; backHref: string }) {
  const { attempt, quiz, reveal, items } = view;
  const pending = attempt.passed === null;
  const pct = attempt.score !== null && attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 10000) / 100 : 0;

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="quiz-result-title"
        className={cn(
          "rounded-xl border p-5",
          pending ? "border-border bg-card" : attempt.passed ? "bg-success-bg border-transparent" : "bg-danger-bg border-transparent",
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          {pending ? (
            <Hourglass className="text-warning-fg size-7" aria-hidden />
          ) : attempt.passed ? (
            <CircleCheckBig className="text-success-fg size-7" aria-hidden />
          ) : (
            <CircleX className="text-danger-fg size-7" aria-hidden />
          )}
          <div>
            <h2 id="quiz-result-title" className="text-[18px] font-bold">
              {pending ? "ส่งคำตอบแล้ว — รอผู้สอนตรวจข้ออัตนัย" : attempt.passed ? "ผ่านแบบทดสอบ" : "ยังไม่ผ่านเกณฑ์"}
            </h2>
            <p className="text-fg-2 text-[13px]">
              ครั้งที่ {attempt.attemptNo}
              {attempt.submittedAt ? ` · ส่งเมื่อ ${formatDateTime(attempt.submittedAt)}` : ""}
            </p>
          </div>
          <p className="ml-auto text-right">
            <span data-quiz-score className="block text-[24px] font-bold tabular-nums">
              {formatScore(attempt.score)}/{formatScore(attempt.maxScore)}
            </span>
            <span className="text-fg-2 text-[12.5px]">
              {formatScore(pct)}% · เกณฑ์ผ่าน {quiz.passingPct}%
            </span>
          </p>
        </div>
        {pending ? (
          <p className="text-fg-2 mt-3 text-[12.5px]">
            คะแนนนี้ยังไม่รวมข้ออัตนัย ผลผ่าน/ไม่ผ่านจะแสดงเมื่อผู้สอนตรวจเสร็จ และคุณจะได้รับการแจ้งเตือน
          </p>
        ) : null}
      </section>

      {!reveal ? (
        <p className="bg-card border-border text-fg-2 rounded-xl border px-4 py-3 text-[13px]">
          {quiz.showAnswers === ShowAnswers.NEVER
            ? "ผู้สอนตั้งค่าไม่แสดงเฉลยของแบบทดสอบนี้"
            : `เฉลยจะแสดงหลังปิดแบบทดสอบ${quiz.availableUntil ? ` (${formatDateTime(quiz.availableUntil)})` : ""}`}
        </p>
      ) : null}

      <ol className="space-y-3">
        {items.map((item) => {
          const v = verdict(item);
          return (
            <li key={item.questionId}>
              <section data-result-question className="bg-card border-border rounded-xl border p-4 sm:p-5">
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
                <AnswerReview item={item} />
                {item.result?.feedback ? (
                  <p className="bg-info-bg text-info-fg mt-3 flex gap-2 rounded-lg px-3 py-2 text-[13px]">
                    <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.result.feedback}
                  </p>
                ) : null}
                {item.key?.explanation ? (
                  <div className="border-line mt-3 border-t pt-3">
                    <p className="mb-1 text-[12.5px] font-semibold">คำอธิบายเฉลย</p>
                    <RichText content={item.key.explanation} className="space-y-2" />
                  </div>
                ) : null}
              </section>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href={backHref as never}>กลับไปที่บทเรียน</Link>
        </Button>
      </div>
    </div>
  );
}
