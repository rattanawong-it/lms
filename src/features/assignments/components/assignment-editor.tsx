"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { RichTextField } from "@/components/editor/rich-text-field";
import { toBangkokInput } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import { saveAssignment } from "@/features/assignments/actions";
import {
  DEFAULT_FILE_TYPES,
  MAX_SUBMISSION_FILE_MB,
  SUBMISSION_FILE_TYPE_KEYS,
} from "@/features/assignments/schemas";
import type { AssignmentEditorData } from "@/features/assignments/queries";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-fg text-[12px] font-medium">
      {message}
    </p>
  );
}

/** M08 · FR-08.1 — สร้าง/แก้งานที่ต้องส่ง */
export function AssignmentEditor({ data }: { data: AssignmentEditorData }) {
  const router = useRouter();
  const { assignment, lessons, course } = data;
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const allowed = new Set(assignment?.allowedTypes ?? DEFAULT_FILE_TYPES);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveAssignment(formData);
      if (result.ok) {
        toast.success(result.message);
        setErrors({});
        router.push(`/teach/courses/${course.id}/assignments`);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submitForm(submit)} className="space-y-5">
      <input type="hidden" name="courseId" value={course.id} />
      {assignment ? <input type="hidden" name="assignmentId" value={assignment.id} /> : null}

      <section aria-labelledby="assignment-basics" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 id="assignment-basics" className="text-[15px] font-semibold">
          รายละเอียดงาน
        </h2>

        {assignment && assignment.submissionCount > 0 ? (
          <p className="bg-warning-bg text-warning-fg flex gap-2 rounded-lg px-3 py-2.5 text-[12.5px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            มีผู้ส่งงานแล้ว {assignment.submissionCount} ครั้ง — การแก้กำหนดส่งหรือชนิดไฟล์มีผลกับการส่งครั้งถัดไป งานที่ส่งแล้วไม่เปลี่ยน
          </p>
        ) : null}

        <Field label="ชื่องาน" name="title" defaultValue={assignment?.title} required error={errors.title} />

        <div className="space-y-[7px]">
          <Label htmlFor="assignment-lesson" className="text-[12.5px] font-medium">
            ผูกกับบทเรียน
          </Label>
          <Select name="lessonId" defaultValue={assignment?.lessonId ?? "none"}>
            <SelectTrigger id="assignment-lesson" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ยังไม่ผูก (ผู้เรียนยังส่งไม่ได้)</SelectItem>
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-[11.5px]">
            {lessons.length === 0
              ? "ยังไม่มีบทชนิด “งานที่ต้องส่ง” ที่ว่าง — เพิ่มบทได้ที่หน้าจัดสารบัญ"
              : "ผู้เรียนส่งงานจากบทเรียนนี้ และบทนี้นับว่าเรียนจบเมื่อส่งงานแล้ว"}
          </p>
          <FieldError message={errors.lessonId} />
        </div>

        <RichTextField
          name="instructions"
          label="คำสั่งงาน"
          defaultValue={assignment?.instructions}
          placeholder="อธิบายว่าต้องทำอะไร ส่งอะไร และเกณฑ์การให้คะแนน"
          error={errors.instructions}
        />
      </section>

      <section aria-labelledby="assignment-rules" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 id="assignment-rules" className="text-[15px] font-semibold">
          กำหนดส่งและการให้คะแนน
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="กำหนดส่ง (เวลาไทย)"
            name="dueAt"
            type="datetime-local"
            defaultValue={toBangkokInput(assignment?.dueAt)}
            hint="เว้นว่าง = ไม่มีกำหนดส่ง"
            error={errors.dueAt}
          />
          <Field
            label="คะแนนเต็ม"
            name="maxScore"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            defaultValue={assignment?.maxScore ?? 10}
            required
            error={errors.maxScore}
          />
        </div>

        <div className="flex min-h-11 items-center gap-2.5">
          <Checkbox id="assignment-allow-late" name="allowLate" defaultChecked={assignment?.allowLate ?? true} />
          <Label htmlFor="assignment-allow-late" className="text-[13px] font-normal">
            รับงานที่ส่งหลังกำหนด (ติดป้าย “ส่งช้า” ให้ผู้สอนพิจารณาเอง ไม่หักคะแนนอัตโนมัติ)
          </Label>
        </div>
      </section>

      <section aria-labelledby="assignment-files" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 id="assignment-files" className="text-[15px] font-semibold">
          ไฟล์ที่รับ
        </h2>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[12.5px] font-medium">ชนิดไฟล์ที่ผู้เรียนแนบได้</legend>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
            {SUBMISSION_FILE_TYPE_KEYS.map((ext) => (
              <div key={ext} className="flex min-h-11 items-center gap-2">
                <Checkbox id={`type-${ext}`} name="allowedTypes" value={ext} defaultChecked={allowed.has(ext)} />
                <Label htmlFor={`type-${ext}`} className="font-mono text-[13px] font-normal">
                  .{ext}
                </Label>
              </div>
            ))}
          </div>
          <FieldError message={errors.allowedTypes} />
        </fieldset>

        <div className="max-w-[240px]">
          <Field
            label="ขนาดต่อไฟล์ไม่เกิน (MB)"
            name="maxFileMb"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SUBMISSION_FILE_MB}
            defaultValue={assignment?.maxFileMb ?? 20}
            required
            hint={`สูงสุด ${MAX_SUBMISSION_FILE_MB} MB · ผู้เรียนส่งข้อความแทนไฟล์ได้เสมอ`}
            error={errors.maxFileMb}
          />
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/teach/courses/${course.id}/assignments`)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {assignment ? "บันทึกงาน" : "สร้างงาน"}
        </Button>
      </div>
    </form>
  );
}
