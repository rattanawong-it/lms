"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { submitForm } from "@/lib/form";
import { reviewAnswer } from "@/features/quiz/actions";
import { FEEDBACK_MAX } from "@/features/quiz/schemas";

/**
 * M07 · FR-07.4 — ให้คะแนนข้ออัตนัย + feedback รายข้อ
 * ข้อที่ตรวจอัตโนมัติแล้ว (`scorable = false`) เขียนได้แค่ความเห็น
 */
export function AnswerReviewForm({
  attemptId,
  questionId,
  number,
  points,
  scorable,
  score,
  feedback,
}: {
  attemptId: string;
  questionId: string;
  number: number;
  points: number;
  scorable: boolean;
  score: number | null;
  feedback: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const feedbackId = React.useId();

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await reviewAnswer(formData);
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form
      onSubmit={submitForm(save)}
      aria-label={`ตรวจข้อ ${number}`}
      className="border-line mt-3 space-y-3 border-t pt-3"
    >
      <input type="hidden" name="attemptId" value={attemptId} />
      <input type="hidden" name="questionId" value={questionId} />

      {scorable ? (
        <div className="max-w-[220px]">
          <Field
            label={`คะแนนข้อ ${number} (เต็ม ${points})`}
            name="score"
            type="number"
            inputMode="decimal"
            min={0}
            max={points}
            step={0.01}
            defaultValue={score ?? ""}
            required
            error={errors.score}
          />
        </div>
      ) : null}

      <div className="space-y-[7px]">
        <Label htmlFor={feedbackId} className="text-[12.5px] font-medium">
          ความเห็นถึงผู้เรียน (ไม่บังคับ)
        </Label>
        <textarea
          id={feedbackId}
          name="feedback"
          defaultValue={feedback ?? ""}
          maxLength={FEEDBACK_MAX}
          rows={3}
          aria-invalid={Boolean(errors.feedback) || undefined}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
        />
        {errors.feedback ? (
          <p role="alert" className="text-danger-fg text-[12px] font-medium">
            {errors.feedback}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {scorable ? "บันทึกคะแนน" : "บันทึกความเห็น"}
      </Button>
    </form>
  );
}
