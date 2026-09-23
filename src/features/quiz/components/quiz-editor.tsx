"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Plus, Search, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { ShowAnswers } from "@/generated/prisma/enums";
import { toBangkokInput } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { saveQuiz } from "@/features/quiz/actions";
import { SHOW_ANSWERS_LABEL } from "@/features/quiz/lib/attempt";
import { QUESTION_TYPE_LABEL } from "@/features/questions/schemas";
import type { QuizEditorData } from "@/features/quiz/queries";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-fg text-[12px] font-medium">
      {message}
    </p>
  );
}

type PoolRow = { key: number; tag: string; count: string };
let poolSeed = 0;

/** M07 · FR-07.3 — ตั้งค่าแบบทดสอบ: ข้อตายตัวจากคลัง + สุ่มจากแท็ก + เวลา/จำนวนครั้ง/เฉลย */
export function QuizEditor({ data }: { data: QuizEditorData }) {
  const router = useRouter();
  const { quiz, bank, tags, lessons, course } = data;
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [selected, setSelected] = React.useState<string[]>(quiz?.questionIds ?? []);
  const [pool, setPool] = React.useState<PoolRow[]>(
    () => quiz?.pool.map((r) => ({ key: (poolSeed += 1), tag: r.tag, count: String(r.count) })) ?? [],
  );
  const [search, setSearch] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("__all__");

  const byId = React.useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const tagCount = React.useMemo(() => new Map(tags.map((t) => [t.tag, t.count])), [tags]);

  const visible = bank.filter(
    (q) =>
      !q.archived &&
      !selected.includes(q.id) &&
      (tagFilter === "__all__" || q.tags.includes(tagFilter)) &&
      (!search.trim() || q.preview.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const fixedPoints = selected.reduce((sum, id) => sum + (byId.get(id)?.points ?? 0), 0);
  const poolCount = pool.reduce((sum, r) => sum + (Number(r.count) || 0), 0);

  function move(index: number, delta: number) {
    setSelected((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function submit(formData: FormData) {
    formData.set("questionIds", JSON.stringify(selected));
    formData.set(
      "pool",
      JSON.stringify(pool.filter((r) => r.tag).map((r) => ({ tag: r.tag, count: Number(r.count) }))),
    );
    startTransition(async () => {
      const result = await saveQuiz(formData);
      if (result.ok) {
        toast.success(result.message);
        setErrors({});
        router.push(`/teach/courses/${course.id}/quizzes`);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submitForm(submit)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="courseId" value={course.id} />
      {quiz ? <input type="hidden" name="quizId" value={quiz.id} /> : null}

      <section aria-labelledby="quiz-settings" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 id="quiz-settings" className="text-[15px] font-semibold">
          การตั้งค่า
        </h2>

        {quiz && quiz.attemptCount > 0 ? (
          <p className="bg-warning-bg text-warning-fg flex gap-2 rounded-lg px-3 py-2.5 text-[12.5px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            มีผู้สอบแล้ว {quiz.attemptCount} ครั้ง — การแก้ไขมีผลกับการสอบครั้งถัดไป ผลสอบเดิมไม่เปลี่ยน
          </p>
        ) : null}

        <Field label="ชื่อแบบทดสอบ" name="title" defaultValue={quiz?.title} required error={errors.title} />

        <div className="space-y-[7px]">
          <Label htmlFor="quiz-lesson" className="text-[12.5px] font-medium">
            ผูกกับบทเรียน
          </Label>
          <Select name="lessonId" defaultValue={quiz?.lessonId ?? "none"}>
            <SelectTrigger id="quiz-lesson" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ยังไม่ผูก (ผู้เรียนยังเข้าทำไม่ได้)</SelectItem>
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-[11.5px]">
            {lessons.length === 0
              ? "ยังไม่มีบทชนิด “แบบทดสอบ” ที่ว่าง — เพิ่มบทได้ที่หน้าจัดสารบัญ"
              : "ผู้เรียนเข้าทำจากบทเรียนนี้ และบทนี้นับว่าเรียนจบเมื่อสอบผ่าน"}
          </p>
          <FieldError message={errors.lessonId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="เวลาทำ (นาที)"
            name="timeLimitMin"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={quiz?.timeLimitMin ?? ""}
            placeholder="ไม่จำกัด"
            error={errors.timeLimitMin}
          />
          <Field
            label="ทำได้กี่ครั้ง"
            name="maxAttempts"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={quiz?.maxAttempts ?? ""}
            placeholder="ไม่จำกัด"
            error={errors.maxAttempts}
          />
          <Field
            label="คะแนนผ่าน (%)"
            name="passingPct"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            defaultValue={quiz?.passingPct ?? 60}
            required
            error={errors.passingPct}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="เปิดให้ทำ (เวลาไทย)"
            name="availableFrom"
            type="datetime-local"
            defaultValue={toBangkokInput(quiz?.availableFrom)}
            hint="เว้นว่าง = เปิดทันที"
            error={errors.availableFrom}
          />
          <Field
            label="ปิดรับ (เวลาไทย)"
            name="availableUntil"
            type="datetime-local"
            defaultValue={toBangkokInput(quiz?.availableUntil)}
            hint="เว้นว่าง = ไม่ปิด · คนที่กำลังทำจะถูกส่งอัตโนมัติเมื่อถึงเวลาปิด"
            error={errors.availableUntil}
          />
        </div>

        <div className="space-y-[7px]">
          <Label htmlFor="quiz-show-answers" className="text-[12.5px] font-medium">
            แสดงเฉลยให้ผู้เรียน
          </Label>
          <Select name="showAnswers" defaultValue={quiz?.showAnswers ?? ShowAnswers.AFTER_CLOSE}>
            <SelectTrigger id="quiz-show-answers" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ShowAnswers).map((v) => (
                <SelectItem key={v} value={v}>
                  {SHOW_ANSWERS_LABEL[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.showAnswers} />
        </div>

        <div className="space-y-2.5">
          {(
            [
              ["shuffleQuestions", "สลับลำดับข้อ", quiz?.shuffleQuestions ?? true],
              ["shuffleChoices", "สลับลำดับตัวเลือก", quiz?.shuffleChoices ?? true],
            ] as const
          ).map(([name, label, checked]) => (
            <div key={name} className="flex min-h-11 items-center gap-2.5">
              <Checkbox id={`quiz-${name}`} name={name} defaultChecked={checked} />
              <Label htmlFor={`quiz-${name}`} className="text-[13px] font-normal">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="quiz-questions" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <div>
          <h2 id="quiz-questions" className="text-[15px] font-semibold">
            ข้อสอบ
          </h2>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            ข้อที่เลือก {selected.length} ข้อ ({formatScore(fixedPoints)} คะแนน)
            {poolCount > 0 ? ` + สุ่มจากแท็ก ${poolCount} ข้อ` : ""}
          </p>
          <FieldError message={errors.questionIds} />
        </div>

        {selected.length > 0 ? (
          <ol aria-label="ข้อที่เลือก" className="border-border divide-line divide-y rounded-lg border">
            {selected.map((id, index) => {
              const q = byId.get(id);
              return (
                <li key={id} data-selected-question className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
                  <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">
                    {q?.preview ?? "(ไม่พบข้อสอบ)"}
                    {q?.archived ? <span className="text-warning-fg"> · เก็บเข้าคลังเก่าแล้ว (จะไม่ถูกใช้)</span> : null}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`เลื่อนข้อ ${index + 1} ขึ้น`}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label={`เลื่อนข้อ ${index + 1} ลง`}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => setSelected((l) => l.filter((x) => x !== id))} aria-label={`เอาข้อ ${index + 1} ออก`}>
                    <X className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        ) : null}

        <div className="space-y-2">
          <p className="text-[12.5px] font-medium">เลือกจากคลังข้อสอบ</p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="ค้นหาในโจทย์"
                aria-label="ค้นหาข้อสอบในคลัง"
                className="bg-card h-11 rounded-[9px] pl-9"
              />
            </div>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger aria-label="กรองคลังตามแท็ก" className="bg-card h-11 w-full rounded-[9px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ทุกแท็ก</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.tag} value={t.tag}>
                    {t.tag} ({t.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ul aria-label="ข้อสอบในคลัง" className="border-border divide-line max-h-[320px] divide-y overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <li className="text-muted-foreground px-3 py-4 text-center text-[12.5px]">
                {bank.length === 0 ? "คลังข้อสอบยังว่าง — เพิ่มข้อสอบที่หน้าคลังข้อสอบก่อน" : "ไม่มีข้อที่ตรงกับตัวกรอง"}
              </li>
            ) : (
              visible.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setSelected((l) => [...l, q.id])}
                    className="hover:bg-muted/60 flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-[12.5px]"
                    aria-label={`เพิ่มข้อ: ${q.preview}`}
                  >
                    <Plus className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2">{q.preview}</span>
                      <span className="text-muted-foreground mt-0.5 block text-[11.5px]">
                        {QUESTION_TYPE_LABEL[q.type]} · {formatScore(q.points)} คะแนน
                        {q.tags.length ? ` · ${q.tags.join(", ")}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
            <Shuffle className="size-4" aria-hidden /> สุ่มจากคลังตามแท็ก (ผู้เรียนแต่ละคนได้ชุดไม่เหมือนกัน)
          </p>
          {pool.map((row, index) => {
            const available = tagCount.get(row.tag) ?? 0;
            const tooMany = row.tag && Number(row.count) > available;
            return (
              <div key={row.key} data-pool-rule className="space-y-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={row.tag || undefined}
                    onValueChange={(tag) => setPool((p) => p.map((r) => (r.key === row.key ? { ...r, tag } : r)))}
                  >
                    <SelectTrigger aria-label={`แท็กของกฎสุ่มที่ ${index + 1}`} className="bg-card h-11 min-w-0 flex-1 rounded-[9px]">
                      <SelectValue placeholder="เลือกแท็ก" />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((t) => (
                        <SelectItem key={t.tag} value={t.tag}>
                          {t.tag} (มี {t.count} ข้อ)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={row.count}
                    onChange={(e) => {
                      const count = e.currentTarget.value;
                      setPool((p) => p.map((r) => (r.key === row.key ? { ...r, count } : r)));
                    }}
                    aria-label={`จำนวนข้อที่สุ่มของกฎที่ ${index + 1}`}
                    className="bg-card h-11 w-20 rounded-[9px]"
                  />
                  <span className="text-muted-foreground text-[12.5px]">ข้อ</span>
                  <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => setPool((p) => p.filter((r) => r.key !== row.key))} aria-label={`ลบกฎสุ่มที่ ${index + 1}`}>
                    <X className="size-4" />
                  </Button>
                </div>
                {tooMany ? (
                  <p className="text-warning-fg text-[11.5px]">
                    แท็กนี้มีเพียง {available} ข้อ (รวมข้อที่เลือกไว้ตายตัว) — ผู้เรียนจะได้ไม่ครบตามจำนวน
                  </p>
                ) : null}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPool((p) => [...p, { key: (poolSeed += 1), tag: "", count: "5" }])}
            disabled={tags.length === 0}
          >
            <Plus className="size-4" /> เพิ่มการสุ่มจากแท็ก
          </Button>
          <FieldError message={errors.pool} />
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/teach/courses/${course.id}/quizzes`)} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {quiz ? "บันทึกการตั้งค่า" : "สร้างแบบทดสอบ"}
        </Button>
      </div>

      {selected.some((id) => byId.get(id)?.archived) ? (
        <Badge className={cn("bg-warning-bg text-warning-fg border-0 lg:col-span-2")}>
          ข้อที่เก็บเข้าคลังเก่าแล้วจะไม่ถูกนำไปสอบ แม้ยังอยู่ในรายการ
        </Badge>
      ) : null}
    </form>
  );
}
