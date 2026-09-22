"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markLessonComplete } from "@/features/enrollment/actions";
import { submitForm } from "@/lib/form";

/**
 * M06 · FR-06.3 — ปุ่ม "เรียนจบบทนี้"
 *
 * ขั้น 6 จะเพิ่มการทำเครื่องหมายอัตโนมัติเมื่อดูวิดีโอครบ 90% ผ่าน `saveProgress()`
 * ซึ่งเรียกจากตัวเล่นวิดีโอ — ปุ่มนี้ยังคงอยู่เป็นทางเลือกสำหรับบทเรียนที่ไม่ใช่วิดีโอ
 */
export function LessonCompleteButton({
  lessonId,
  completed,
  disabled,
  disabledReason,
}: {
  lessonId: string;
  completed: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(formData: FormData) {
    startTransition(async () => {
      const result = await markLessonComplete(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (disabled) {
    return (
      <p className="text-muted-foreground text-[12.5px]">
        {disabledReason ?? "บันทึกความคืบหน้าไม่ได้ในโหมดนี้"}
      </p>
    );
  }

  return (
    <form onSubmit={submitForm(run)}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="completed" value={completed ? "false" : "true"} />
      <Button type="submit" variant={completed ? "outline" : "default"} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : completed ? (
          <RotateCcw className="size-4" />
        ) : (
          <CircleCheckBig className="size-4" />
        )}
        {completed ? "ยกเลิกการทำเครื่องหมาย" : "เรียนจบบทนี้"}
      </Button>
    </form>
  );
}
