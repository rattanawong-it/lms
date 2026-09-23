"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { RichTextField } from "@/components/editor/rich-text-field";
import { QuestionType } from "@/generated/prisma/enums";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { createQuestion, updateQuestion } from "@/features/questions/actions";
import {
  MAX_CHOICES,
  MAX_MATCHING_PAIRS,
  QUESTION_TYPE_LABEL,
  TRUE_FALSE_CHOICES,
} from "@/features/questions/schemas";
import type { BankQuestion } from "@/features/questions/queries";

type DraftChoice = {
  key: string;
  id?: string;
  text: string;
  isCorrect: boolean;
  matchKey: string;
};

let keySeed = 0;
const nextKey = () => `c${(keySeed += 1)}`;

function blankChoices(type: QuestionType): DraftChoice[] {
  const blank = (isCorrect = false): DraftChoice => ({ key: nextKey(), text: "", isCorrect, matchKey: "" });
  switch (type) {
    case QuestionType.SINGLE:
    case QuestionType.MULTIPLE:
      return [blank(), blank(), blank(), blank()];
    case QuestionType.MATCHING:
      return [blank(true), blank(true), blank(true)];
    case QuestionType.SHORT_TEXT:
      return [blank(true)];
    default:
      return [];
  }
}

/** แปลงสถานะในฟอร์มเป็นรูปแบบที่ตัวตรวจฝั่ง server รับ (schemas.ts) */
function toPayload(type: QuestionType, choices: DraftChoice[], trueIsCorrect: boolean | null) {
  if (type === QuestionType.TRUE_FALSE) {
    return TRUE_FALSE_CHOICES.map((text, i) => ({
      id: choices[i]?.id,
      text,
      isCorrect: trueIsCorrect === null ? false : trueIsCorrect === (i === 0),
      matchKey: null,
    }));
  }
  if (type === QuestionType.ESSAY) return [];
  return choices
    .filter((c) => c.text.trim() || c.matchKey.trim())
    .map((c) => ({
      id: c.id,
      text: c.text,
      isCorrect: type === QuestionType.MATCHING || type === QuestionType.SHORT_TEXT ? true : c.isCorrect,
      matchKey: type === QuestionType.MATCHING ? c.matchKey : null,
    }));
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-fg text-[12px] font-medium">
      {message}
    </p>
  );
}

/** M07 · FR-07.2 — สร้าง/แก้ข้อสอบ 6 ชนิด */
export function QuestionEditor({
  courseId,
  question,
  onDone,
}: {
  courseId: string;
  /** ไม่ระบุ = สร้างใหม่ */
  question?: BankQuestion;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [type, setType] = React.useState<QuestionType>(question?.type ?? QuestionType.SINGLE);
  const [choices, setChoices] = React.useState<DraftChoice[]>(() =>
    question
      ? question.choices.map((c) => ({
          key: nextKey(),
          id: c.id,
          text: c.text,
          isCorrect: c.isCorrect,
          matchKey: c.matchKey ?? "",
        }))
      : blankChoices(QuestionType.SINGLE),
  );
  const [trueIsCorrect, setTrueIsCorrect] = React.useState<boolean | null>(() =>
    question?.type === QuestionType.TRUE_FALSE ? (question.choices[0]?.isCorrect ?? null) : null,
  );
  const groupName = React.useId();

  function changeType(next: QuestionType) {
    setType(next);
    setChoices(blankChoices(next));
    setTrueIsCorrect(null);
    setErrors({});
  }

  function patch(key: string, change: Partial<DraftChoice>) {
    setChoices((list) =>
      list.map((c) => {
        if (c.key === key) return { ...c, ...change };
        // ปรนัยตอบเดียว: เลือกข้อใหม่แล้วข้ออื่นต้องไม่ถูก
        if (type === QuestionType.SINGLE && change.isCorrect) return { ...c, isCorrect: false };
        return c;
      }),
    );
  }

  function submit(formData: FormData) {
    formData.set("choices", JSON.stringify(toPayload(type, choices, trueIsCorrect)));
    startTransition(async () => {
      const result = question ? await updateQuestion(formData) : await createQuestion(formData);
      if (result.ok) {
        toast.success(result.message);
        setErrors({});
        onDone();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  const limit = type === QuestionType.MATCHING ? MAX_MATCHING_PAIRS : MAX_CHOICES;

  return (
    <form onSubmit={submitForm(submit)} className="space-y-5">
      {question ? (
        <input type="hidden" name="id" value={question.id} />
      ) : (
        <input type="hidden" name="courseId" value={courseId} />
      )}

      {question && question.answerCount > 0 ? (
        <p className="bg-warning-bg text-warning-fg flex gap-2 rounded-lg px-3 py-2.5 text-[12.5px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          มีผู้ตอบข้อนี้แล้ว {question.answerCount} ครั้ง — แก้เฉลยหรือคะแนนแล้ว ผลสอบที่ส่งไปแล้วจะไม่ถูกคิดคะแนนใหม่
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="space-y-[7px]">
          <Label htmlFor="question-type" className="text-[12.5px] font-medium">
            ชนิดข้อสอบ
          </Label>
          {question ? (
            <p id="question-type" className="text-fg-2 flex h-11 items-center text-[13.5px]">
              {QUESTION_TYPE_LABEL[type]} (เปลี่ยนชนิดของข้อที่สร้างแล้วไม่ได้)
            </p>
          ) : (
            <Select name="type" value={type} onValueChange={(v) => changeType(v as QuestionType)}>
              <SelectTrigger id="question-type" className="bg-card h-11 w-full rounded-[9px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(QuestionType).map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Field
          label="คะแนน"
          name="points"
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.25"
          defaultValue={question?.points ?? 1}
          required
          error={errors.points}
        />
      </div>

      <RichTextField
        name="prompt"
        label="โจทย์"
        defaultValue={question?.prompt}
        minHeight={120}
        placeholder="พิมพ์คำถาม ใส่รูปหรือตารางประกอบได้"
        error={errors.prompt}
      />

      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-[12.5px] font-medium">
          {type === QuestionType.MATCHING
            ? "คู่ที่ถูกต้อง (ระบบจะสลับฝั่งขวาให้ตอนสอบ)"
            : type === QuestionType.SHORT_TEXT
              ? "คำตอบที่ยอมรับ (ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่างหัวท้าย)"
              : type === QuestionType.ESSAY
                ? "คำตอบ"
                : type === QuestionType.TRUE_FALSE
                  ? "คำตอบที่ถูก"
                  : type === QuestionType.SINGLE
                    ? "ตัวเลือก — เลือกคำตอบที่ถูก 1 ข้อ"
                    : "ตัวเลือก — ติ๊กทุกข้อที่ถูก (ต้องตอบถูกครบจึงได้คะแนน)"}
        </legend>

        {type === QuestionType.ESSAY ? (
          <p className="text-muted-foreground text-[12.5px]">
            ข้ออัตนัยไม่มีตัวเลือก ผู้สอนตรวจและให้คะแนนเองหลังผู้เรียนส่ง
          </p>
        ) : type === QuestionType.TRUE_FALSE ? (
          <div role="radiogroup" className="flex gap-2">
            {TRUE_FALSE_CHOICES.map((text, i) => {
              const value = i === 0;
              return (
                <label
                  key={text}
                  className={cn(
                    "border-border flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-[14px] font-medium",
                    trueIsCorrect === value && "border-primary bg-accent text-accent-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    className="accent-primary size-4"
                    checked={trueIsCorrect === value}
                    onChange={() => setTrueIsCorrect(value)}
                  />
                  {text}
                </label>
              );
            })}
          </div>
        ) : (
          <>
            {choices.map((c, index) => (
              <div key={c.key} className="flex items-center gap-2">
                {type === QuestionType.SINGLE || type === QuestionType.MULTIPLE ? (
                  <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type={type === QuestionType.SINGLE ? "radio" : "checkbox"}
                      name={type === QuestionType.SINGLE ? groupName : undefined}
                      className="accent-primary size-[18px]"
                      checked={c.isCorrect}
                      onChange={(e) => patch(c.key, { isCorrect: e.currentTarget.checked })}
                      aria-label={`ตัวเลือกที่ ${index + 1} เป็นคำตอบที่ถูก`}
                    />
                  </label>
                ) : null}
                <Input
                  value={c.text}
                  onChange={(e) => patch(c.key, { text: e.currentTarget.value })}
                  placeholder={
                    type === QuestionType.MATCHING
                      ? `ฝั่งซ้าย ${index + 1}`
                      : type === QuestionType.SHORT_TEXT
                        ? `คำตอบที่ยอมรับ ${index + 1}`
                        : `ตัวเลือกที่ ${index + 1}`
                  }
                  aria-label={
                    type === QuestionType.MATCHING ? `ฝั่งซ้ายคู่ที่ ${index + 1}` : `ตัวเลือกที่ ${index + 1}`
                  }
                  className="bg-card h-11 min-w-0 flex-1 rounded-[9px]"
                />
                {type === QuestionType.MATCHING ? (
                  <>
                    <span aria-hidden className="text-muted-foreground">
                      =
                    </span>
                    <Input
                      value={c.matchKey}
                      onChange={(e) => patch(c.key, { matchKey: e.currentTarget.value })}
                      placeholder={`ฝั่งขวา ${index + 1}`}
                      aria-label={`ฝั่งขวาคู่ที่ ${index + 1}`}
                      className="bg-card h-11 min-w-0 flex-1 rounded-[9px]"
                    />
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  onClick={() => setChoices((list) => list.filter((x) => x.key !== c.key))}
                  aria-label={`ลบตัวเลือกที่ ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {choices.length < limit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setChoices((list) => [
                    ...list,
                    {
                      key: nextKey(),
                      text: "",
                      matchKey: "",
                      isCorrect: type === QuestionType.MATCHING || type === QuestionType.SHORT_TEXT,
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                {type === QuestionType.MATCHING ? "เพิ่มคู่" : type === QuestionType.SHORT_TEXT ? "เพิ่มคำตอบ" : "เพิ่มตัวเลือก"}
              </Button>
            ) : null}
          </>
        )}
        <FieldError message={errors.choices} />
      </fieldset>

      <Field
        label="แท็ก (ไม่บังคับ — คั่นด้วยจุลภาค)"
        name="tags"
        defaultValue={question?.tags.join(", ")}
        placeholder="เช่น บทที่ 1, พื้นฐาน"
        hint="ใช้สุ่มข้อสอบจากคลังตามแท็กในขั้นตั้งค่าแบบทดสอบ"
        error={errors.tags}
      />

      <RichTextField
        name="explanation"
        label="คำอธิบายเฉลย (ไม่บังคับ)"
        defaultValue={question?.explanation ?? undefined}
        minHeight={80}
        placeholder="แสดงให้ผู้เรียนเห็นตามการตั้งค่าเฉลยของแบบทดสอบ"
      />

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {question ? "บันทึกการแก้ไข" : "เพิ่มเข้าคลัง"}
        </Button>
      </div>
    </form>
  );
}
