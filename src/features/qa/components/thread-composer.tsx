"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCirclePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { submitForm } from "@/lib/form";
import { createThread } from "@/features/qa/actions";
import { QA_BODY_MAX, QA_TITLE_MAX } from "@/features/qa/schemas";
import { QaTextarea } from "@/features/qa/components/qa-textarea";

const NO_LESSON = "none";

/**
 * M13 · FR-13.1 — ตั้งคำถามใหม่
 *   lessons  — ให้เลือกบทเรียน (หน้าถาม-ตอบของคอร์ส)
 *   lessonId — ผูกบทเรียนตายตัว (ส่วนถาม-ตอบในหน้าเรียน)
 * ตั้งสำเร็จแล้วไปหน้ากระทู้ (`openAfterCreate`) หรือพับฟอร์มแล้วโหลดรายการใหม่
 */
export function ThreadComposer({
  courseId,
  lessons,
  lessonId,
  openAfterCreate = true,
  collapsible = false,
}: {
  courseId: string;
  lessons?: { id: string; title: string }[];
  lessonId?: string;
  openAfterCreate?: boolean;
  collapsible?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(!collapsible);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [lesson, setLesson] = React.useState(NO_LESSON);
  const [formKey, setFormKey] = React.useState(0);
  const titleId = React.useId();

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MessageCirclePlus className="size-4" /> ถามคำถาม
      </Button>
    );
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createThread(formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setErrors({});
      if (openAfterCreate && result.threadId) {
        router.push(`/learn/${courseId}/qa/${result.threadId}`);
        return;
      }
      setFormKey((k) => k + 1);
      setLesson(NO_LESSON);
      if (collapsible) setOpen(false);
      router.refresh();
    });
  }

  return (
    <form
      key={formKey}
      onSubmit={submitForm(submit)}
      aria-labelledby={titleId}
      className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold">
        <MessageCirclePlus className="text-primary size-[18px]" aria-hidden /> ถามคำถามใหม่
      </h2>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonId" value={lessonId ?? (lesson === NO_LESSON ? "" : lesson)} />

      <Field
        label="หัวข้อคำถาม"
        name="title"
        maxLength={QA_TITLE_MAX}
        placeholder="สรุปสั้น ๆ ว่าอยากถามอะไร"
        required
        error={errors.title}
      />

      <QaTextarea
        label="รายละเอียด"
        name="body"
        rows={5}
        maxLength={QA_BODY_MAX}
        placeholder="อธิบายสิ่งที่ลองแล้วและจุดที่ติด · วางลิงก์ได้ (ข้อความล้วน)"
        error={errors.body}
      />

      {lessons && !lessonId ? (
        <div className="space-y-[7px]">
          <Label htmlFor={`${titleId}-lesson`} className="text-[12.5px] font-medium">
            เกี่ยวกับบทเรียน (ไม่บังคับ)
          </Label>
          <Select value={lesson} onValueChange={setLesson}>
            <SelectTrigger id={`${titleId}-lesson`} className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LESSON}>ทั้งคอร์ส (ไม่ระบุบทเรียน)</SelectItem>
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.lessonId ? (
            <p role="alert" className="text-danger-fg text-[12px] font-medium">
              {errors.lessonId}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {collapsible ? (
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            ยกเลิก
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          ตั้งคำถาม
        </Button>
      </div>
    </form>
  );
}
