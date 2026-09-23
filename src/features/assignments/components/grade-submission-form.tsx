"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { submitForm } from "@/lib/form";
import { gradeSubmission } from "@/features/assignments/actions";
import { GRADE_FEEDBACK_MAX } from "@/features/assignments/schemas";

/**
 * M08 · FR-08.4 — ให้คะแนน + ความเห็น หรือส่งกลับให้แก้
 * ปุ่มทั้งสองส่งฟอร์มเดียวกัน ต่างกันที่ `decision` (ค่าของปุ่มที่กด)
 */
export function GradeSubmissionForm({
  submissionId,
  maxScore,
  score,
  feedback,
}: {
  submissionId: string;
  maxScore: number;
  score: number | null;
  feedback: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const feedbackId = React.useId();

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await gradeSubmission(formData);
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // ปุ่มที่กด (submitter) บอกว่าตรวจหรือส่งกลับ — Enter ในช่องคะแนนนับเป็น "บันทึกคะแนน"
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === "return" ? "return" : "grade";
    submitForm((formData) => {
      formData.set("decision", decision);
      save(formData);
    })(event);
  }

  return (
    <form onSubmit={onSubmit} aria-label="ตรวจงาน" className="space-y-4" noValidate>
      <input type="hidden" name="submissionId" value={submissionId} />

      <div className="max-w-[240px]">
        <Field
          label={`คะแนน (เต็ม ${maxScore})`}
          name="score"
          type="number"
          inputMode="decimal"
          min={0}
          max={maxScore}
          step={0.01}
          defaultValue={score ?? ""}
          error={errors.score}
        />
      </div>

      <div className="space-y-[7px]">
        <Label htmlFor={feedbackId} className="text-[12.5px] font-medium">
          ความเห็นถึงผู้เรียน
        </Label>
        <textarea
          id={feedbackId}
          name="feedback"
          rows={4}
          maxLength={GRADE_FEEDBACK_MAX}
          defaultValue={feedback ?? ""}
          aria-invalid={Boolean(errors.feedback) || undefined}
          aria-describedby={`${feedbackId}-hint`}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
        />
        <p id={`${feedbackId}-hint`} className="text-muted-foreground text-[11.5px]">
          ไม่บังคับเมื่อให้คะแนน · บังคับเมื่อส่งกลับให้แก้
        </p>
        {errors.feedback ? (
          <p role="alert" className="text-danger-fg text-[12px] font-medium">
            {errors.feedback}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="grade" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกคะแนน
        </Button>
        <Button type="submit" name="decision" value="return" variant="outline" disabled={pending} className="min-h-11">
          ส่งกลับให้แก้
        </Button>
      </div>
    </form>
  );
}
