"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { upsertMyReview } from "@/features/reviews/actions";
import { REVIEW_COMMENT_MAX } from "@/features/reviews/schemas";

const STAR_LABEL = ["", "แย่มาก", "พอใช้", "ปานกลาง", "ดี", "ดีมาก"];

/**
 * FR-14.1 — เขียน/แก้รีวิวของตัวเอง
 * เลือกดาวด้วยปุ่ม radio จริง (ลูกศรซ้ายขวาเลื่อนได้ · ผู้อ่านหน้าจอประกาศ "4 ดาว — ดี")
 */
export function ReviewForm({
  courseId,
  initial,
}: {
  courseId: string;
  initial: { rating: number; comment: string | null; isHidden?: boolean } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = React.useState(initial?.rating ?? 0);
  const [hover, setHover] = React.useState(0);
  const [editing, setEditing] = React.useState(initial === null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const name = React.useId();

  if (!editing) {
    return (
      <div className="bg-card border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <p className="text-[13px]">
          คุณให้ <span className="font-semibold">{initial?.rating} ดาว</span> กับคอร์สนี้แล้ว
          {initial?.isHidden ? (
            <span className="text-warning-fg block text-[12.5px]">
              ผู้ดูแลซ่อนรีวิวนี้ไว้ — ผู้อื่นไม่เห็นและไม่นับในคะแนนเฉลี่ย
            </span>
          ) : null}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          แก้ไขรีวิวของฉัน
        </Button>
      </div>
    );
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await upsertMyReview(formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setErrors({});
      setEditing(false);
      router.refresh();
    });
  }

  const shown = hover || rating;

  return (
    <form
      aria-label="รีวิวของฉัน"
      onSubmit={submitForm(submit)}
      className="bg-card border-border space-y-3 rounded-xl border p-4 sm:p-5"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <fieldset>
        <legend className="text-[13.5px] font-semibold">ให้คะแนนคอร์สนี้</legend>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="has-focus-visible:ring-ring flex size-11 cursor-pointer items-center justify-center rounded-lg has-focus-visible:ring-2"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
                aria-label={`${n} ดาว — ${STAR_LABEL[n]}`}
              />
              <Star
                aria-hidden
                className={cn("size-7", n <= shown ? "fill-warning-fg text-warning-fg" : "text-border")}
              />
            </label>
          ))}
          <span className="text-muted-foreground ml-2 text-[13px]" aria-live="polite">
            {shown ? `${shown} ดาว — ${STAR_LABEL[shown]}` : "ยังไม่ได้เลือก"}
          </span>
        </div>
        {errors.rating ? (
          <p role="alert" className="text-danger-fg mt-1 text-[12px] font-medium">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>

      <div className="space-y-[7px]">
        <label htmlFor={`${name}-comment`} className="text-[12.5px] font-medium">
          ความคิดเห็น (ไม่บังคับ)
        </label>
        <textarea
          id={`${name}-comment`}
          name="comment"
          rows={4}
          maxLength={REVIEW_COMMENT_MAX}
          defaultValue={initial?.comment ?? ""}
          placeholder="เล่าให้ผู้เรียนคนอื่นฟังว่าคอร์สนี้เป็นอย่างไร"
          aria-invalid={Boolean(errors.comment) || undefined}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
        />
        {errors.comment ? (
          <p role="alert" className="text-danger-fg text-[12px] font-medium">
            {errors.comment}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        {initial ? (
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
            ยกเลิก
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {initial ? "บันทึกรีวิว" : "ส่งรีวิว"}
        </Button>
      </div>
    </form>
  );
}
