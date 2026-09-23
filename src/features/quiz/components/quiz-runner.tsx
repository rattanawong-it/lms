"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichText } from "@/components/shared/rich-text";
import { QuestionType } from "@/generated/prisma/enums";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { saveAnswer, submitAttempt } from "@/features/quiz/actions";
import { isBlankResponse, type QuizResponse } from "@/features/quiz/lib/grading";
import { ESSAY_MAX, SHORT_TEXT_MAX } from "@/features/quiz/schemas";
import { QUESTION_TYPE_LABEL } from "@/features/questions/schemas";
import type { AttemptView } from "@/features/quiz/queries";

type Item = AttemptView["items"][number];
type SaveState = "idle" | "saving" | "saved" | "error";

/** ข้อความมีดีเลย์ก่อนบันทึก — ตัวเลือกบันทึกทันทีที่คลิก */
const TEXT_DEBOUNCE_MS = 800;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * นับถอยหลังจาก `expiresAt` ของ server · ชดเชยนาฬิกาเครื่องผู้เรียนด้วยส่วนต่างกับ `serverNow`
 * (แก้เวลาเครื่องแล้วไม่ได้เวลาเพิ่ม — server ตัดสินที่ `expiresAt` อยู่ดี นี่แค่ให้ตัวเลขที่เห็นตรงความจริง)
 */
function useRemaining(expiresAt: string | null, serverNow: string): number | null {
  // ค่าแรกใช้เวลาของ server ตอน render (pure) แล้วเดินต่อด้วยนาฬิกาเครื่องที่ชดเชยส่วนต่างแล้ว
  const [now, setNow] = React.useState(() => new Date(serverNow).getTime());
  React.useEffect(() => {
    if (!expiresAt) return;
    const offset = new Date(serverNow).getTime() - Date.now();
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, serverNow]);
  return expiresAt ? new Date(expiresAt).getTime() - now : null;
}

function QuestionInput({
  item,
  value,
  onChange,
  disabled,
}: {
  item: Item;
  value: QuizResponse | undefined;
  onChange: (response: QuizResponse, mode: "now" | "debounce") => void;
  disabled: boolean;
}) {
  const name = `q-${item.questionId}`;
  const v = (value ?? {}) as Partial<Record<string, unknown>>;
  const optionClass =
    "border-border has-[:checked]:border-primary has-[:checked]:bg-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-[14px]";

  switch (item.type) {
    case QuestionType.SINGLE:
    case QuestionType.TRUE_FALSE:
      return (
        <div role="radiogroup" aria-label={`คำตอบข้อ ${item.number}`} className="space-y-2">
          {item.choices.map((c) => (
            <label key={c.id} className={optionClass}>
              <input
                type="radio"
                name={name}
                className="accent-primary size-[18px] shrink-0"
                checked={v.choiceId === c.id}
                onChange={() => onChange({ choiceId: c.id }, "now")}
                disabled={disabled}
              />
              <span>{c.text}</span>
            </label>
          ))}
        </div>
      );

    case QuestionType.MULTIPLE: {
      const picked = new Set(Array.isArray(v.choiceIds) ? (v.choiceIds as string[]) : []);
      return (
        <div role="group" aria-label={`คำตอบข้อ ${item.number} (เลือกได้หลายข้อ)`} className="space-y-2">
          {item.choices.map((c) => (
            <label key={c.id} className={optionClass}>
              <input
                type="checkbox"
                className="accent-primary size-[18px] shrink-0"
                checked={picked.has(c.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.currentTarget.checked) next.add(c.id);
                  else next.delete(c.id);
                  // คงลำดับตามที่แสดง เพื่อให้คำตอบที่บันทึกอ่านง่ายเวลาตรวจ
                  onChange({ choiceIds: item.choices.map((x) => x.id).filter((id) => next.has(id)) }, "now");
                }}
                disabled={disabled}
              />
              <span>{c.text}</span>
            </label>
          ))}
        </div>
      );
    }

    case QuestionType.MATCHING: {
      const pairs = (v.pairs && typeof v.pairs === "object" ? v.pairs : {}) as Record<string, string>;
      return (
        <div className="space-y-2">
          {item.choices.map((c) => (
            <div key={c.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <span className="text-[14px]">{c.text}</span>
              <select
                value={pairs[c.id] ?? ""}
                onChange={(e) => {
                  const next = { ...pairs };
                  if (e.currentTarget.value) next[c.id] = e.currentTarget.value;
                  else delete next[c.id];
                  onChange({ pairs: next }, "now");
                }}
                disabled={disabled}
                aria-label={`คู่ของ “${c.text}”`}
                className="border-input bg-card h-11 w-full rounded-[9px] border px-3 text-[14px]"
              >
                <option value="">— เลือก —</option>
                {item.rightOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }

    case QuestionType.SHORT_TEXT:
      return (
        <Input
          value={typeof v.text === "string" ? v.text : ""}
          onChange={(e) => onChange({ text: e.currentTarget.value }, "debounce")}
          maxLength={SHORT_TEXT_MAX}
          disabled={disabled}
          aria-label={`คำตอบข้อ ${item.number}`}
          placeholder="พิมพ์คำตอบ"
          className="bg-card h-11 rounded-[9px]"
        />
      );

    case QuestionType.ESSAY:
      return (
        <textarea
          value={typeof v.text === "string" ? v.text : ""}
          onChange={(e) => onChange({ text: e.currentTarget.value }, "debounce")}
          maxLength={ESSAY_MAX}
          disabled={disabled}
          aria-label={`คำตอบข้อ ${item.number}`}
          placeholder="เขียนคำตอบ"
          rows={6}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
        />
      );
  }
}

/** M07 · FR-07.5 — ทำข้อสอบ: บันทึกทีละข้อทันที นับถอยหลังตามเวลา server และส่งเองเมื่อหมดเวลา */
export function QuizRunner({ view }: { view: AttemptView }) {
  const router = useRouter();
  const { attempt, items } = view;
  const [responses, setResponses] = React.useState<Record<string, QuizResponse>>(() =>
    Object.fromEntries(
      items.filter((i) => i.response !== null).map((i) => [i.questionId, i.response as QuizResponse]),
    ),
  );
  const [saveState, setSaveState] = React.useState<Record<string, SaveState>>({});
  const [confirming, setConfirming] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const timers = React.useRef(new Map<string, number>());
  const inflight = React.useRef(new Set<Promise<unknown>>());
  const submitted = React.useRef(false);

  const expiresAt = attempt.expiresAt ? new Date(attempt.expiresAt).toISOString() : null;
  const remaining = useRemaining(expiresAt, view.serverNow);

  const responsesRef = React.useRef(responses);
  React.useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  const persist = React.useCallback(
    (questionId: string, response: QuizResponse) => {
      setSaveState((s) => ({ ...s, [questionId]: "saving" }));
      const job = saveAnswer({ attemptId: attempt.id, questionId, response })
        .then((result) => {
          setSaveState((s) => ({ ...s, [questionId]: result.ok ? "saved" : "error" }));
          if (!result.ok) {
            toast.error(result.message);
            // หมดเวลา/ส่งไปแล้ว — ให้ server แสดงผลลัพธ์
            if (result.closed) router.refresh();
          }
        })
        .catch(() => setSaveState((s) => ({ ...s, [questionId]: "error" })))
        .finally(() => inflight.current.delete(job));
      inflight.current.add(job);
    },
    [attempt.id, router],
  );

  function change(questionId: string, response: QuizResponse, mode: "now" | "debounce") {
    setResponses((r) => ({ ...r, [questionId]: response }));
    window.clearTimeout(timers.current.get(questionId));
    if (mode === "now") {
      persist(questionId, response);
    } else {
      timers.current.set(
        questionId,
        window.setTimeout(() => {
          timers.current.delete(questionId);
          persist(questionId, response);
        }, TEXT_DEBOUNCE_MS),
      );
    }
  }

  /** ส่งคำตอบที่ยังค้างในดีเลย์ให้หมด แล้วรอทุกคำขอบันทึกเสร็จก่อนกดส่ง */
  const flush = React.useCallback(async () => {
    for (const [questionId, timer] of timers.current) {
      window.clearTimeout(timer);
      const response = responsesRef.current[questionId];
      if (response) persist(questionId, response);
    }
    timers.current.clear();
    await Promise.allSettled([...inflight.current]);
  }, [persist]);

  const submit = React.useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      setConfirming(false);
      await flush();
      const formData = new FormData();
      formData.set("attemptId", attempt.id);
      const result = await submitAttempt(formData);
      if (auto) toast.info("หมดเวลาแล้ว ระบบส่งคำตอบให้อัตโนมัติ");
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    },
    [attempt.id, flush, router],
  );

  // หมดเวลา → ส่งเองครั้งเดียว
  React.useEffect(() => {
    if (remaining !== null && remaining <= 0) void submit(true);
  }, [remaining, submit]);

  const answered = items.filter((i) => !isBlankResponse(responses[i.questionId])).length;
  const unanswered = items.length - answered;
  const lowTime = remaining !== null && remaining < 60_000;

  return (
    <div className="space-y-4">
      <div className="bg-card border-border sticky top-[70px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5">
        <p className="text-[13px]">
          ตอบแล้ว <strong className="tabular-nums">{answered}</strong>/{items.length} ข้อ
        </p>
        {remaining !== null ? (
          <p
            role="timer"
            aria-label="เวลาที่เหลือ"
            className={cn(
              "flex items-center gap-1.5 text-[15px] font-semibold tabular-nums",
              lowTime && "text-danger-fg",
            )}
          >
            <Clock className="size-4" aria-hidden /> {formatRemaining(remaining)}
          </p>
        ) : (
          <p className="text-muted-foreground text-[12.5px]">ไม่จำกัดเวลา</p>
        )}
        <Button type="button" onClick={() => setConfirming(true)} disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          ส่งคำตอบ
        </Button>
      </div>

      <ol className="space-y-3">
        {items.map((item) => {
          const state = saveState[item.questionId] ?? "idle";
          return (
            <li key={item.questionId}>
              <section
                aria-labelledby={`q-${item.questionId}-label`}
                data-quiz-question
                className="bg-card border-border rounded-xl border p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span id={`q-${item.questionId}-label`} className="text-[14px] font-semibold">
                    ข้อ {item.number}
                  </span>
                  <span className="text-muted-foreground">
                    {QUESTION_TYPE_LABEL[item.type]} · {formatScore(item.points)} คะแนน
                  </span>
                  <span className="ml-auto" aria-live="polite">
                    {state === "saving" ? (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" /> กำลังบันทึก
                      </span>
                    ) : state === "saved" ? (
                      <span className="text-success-fg flex items-center gap-1">
                        <Check className="size-3" /> บันทึกแล้ว
                      </span>
                    ) : state === "error" ? (
                      <span className="text-danger-fg flex items-center gap-1">
                        <AlertTriangle className="size-3" /> บันทึกไม่สำเร็จ
                      </span>
                    ) : null}
                  </span>
                </div>
                <RichText content={item.prompt} className="mt-2 mb-3 space-y-2" />
                <QuestionInput
                  item={item}
                  value={responses[item.questionId]}
                  onChange={(response, mode) => change(item.questionId, response, mode)}
                  disabled={submitting}
                />
              </section>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={() => setConfirming(true)} disabled={submitting}>
          <Send className="size-4" /> ส่งคำตอบ
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ส่งคำตอบ?</DialogTitle>
            <DialogDescription>
              {unanswered > 0
                ? `ยังมี ${unanswered} ข้อที่ไม่ได้ตอบ — ข้อที่ไม่ตอบได้ 0 คะแนน `
                : "ตอบครบทุกข้อแล้ว "}
              ส่งแล้วแก้คำตอบไม่ได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              กลับไปทำต่อ
            </Button>
            <Button type="button" onClick={() => void submit(false)}>
              ยืนยันส่งคำตอบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
