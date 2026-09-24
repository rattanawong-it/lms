"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { formatScore } from "@/lib/decimal";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { GradeSource, GradingMode } from "@/generated/prisma/enums";
import {
  addManualItem,
  deleteManualItem,
  saveCourseCurve,
  saveWeights,
} from "@/features/gradebook/actions";
import { weightSum } from "@/features/gradebook/lib/calc";
import { ScoreCurveForm } from "@/features/score-curve/components/score-curve-form";
import { CURVE_SOURCE_LABEL, GRADING_MODE_LABEL } from "@/features/score-curve/schemas";
import type { GradebookSettings } from "@/features/gradebook/queries";
import { SOURCE_LABEL } from "@/features/gradebook/schemas";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (
    action: (formData: FormData) => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string> }>,
    formData: FormData,
    onDone?: (result: { ok: boolean; fieldErrors?: Record<string, string> }) => void,
  ) =>
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      onDone?.(result);
    });
  return { pending, run };
}

/** FR-09.1 / FR-09.2 — น้ำหนักทุกรายการ (บันทึกพร้อมกัน) + ลบรายการกรอกเอง */
function WeightsForm({ data }: { data: GradebookSettings }) {
  const { pending, run } = useAction();
  const [weights, setWeights] = React.useState(() =>
    Object.fromEntries(data.items.map((i) => [i.id, String(i.weight)])),
  );
  const total = weightSum(data.items.map((i) => Number(weights[i.id]) || 0));

  function submit(formData: FormData) {
    formData.set("weights", JSON.stringify(data.items.map((i) => ({ id: i.id, weight: weights[i.id] || "0" }))));
    run(saveWeights, formData);
  }

  return (
    <form onSubmit={submitForm(submit)} aria-labelledby="weights-title" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
      <input type="hidden" name="courseId" value={data.course.id} />
      <div>
        <h2 id="weights-title" className="text-[15px] font-semibold">
          รายการคะแนนและน้ำหนัก
        </h2>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          แบบทดสอบและงานถูกเพิ่มให้อัตโนมัติ (แบบทดสอบนับเป็นร้อยละของครั้งที่ดีที่สุด) · น้ำหนักรวมต้องเท่ากับ 100% จึงคำนวณเกรดได้
        </p>
      </div>

      {data.items.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">ยังไม่มีรายการคะแนน — สร้างแบบทดสอบ/งาน หรือเพิ่มรายการกรอกเองด้านล่าง</p>
      ) : (
        <ul className="border-border divide-line divide-y rounded-lg border">
          {data.items.map((item) => (
            <li key={item.id} data-grade-item className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-[13.5px]">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="text-muted-foreground text-[11.5px]">
                  {SOURCE_LABEL[item.source]} · เต็ม {formatScore(item.maxScore)}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-[13px]">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  value={weights[item.id] ?? ""}
                  onChange={(e) => {
                    // อ่านค่าก่อน — updater ทำงานทีหลัง ตอนนั้น currentTarget เป็น null แล้ว
                    const weight = e.currentTarget.value;
                    setWeights((w) => ({ ...w, [item.id]: weight }));
                  }}
                  aria-label={`น้ำหนัก ${item.title} (%)`}
                  className="bg-card h-11 w-[96px] text-right tabular-nums"
                />
                %
              </label>
              {item.source === GradeSource.MANUAL ? (
                <DeleteItemButton id={item.id} title={item.title} graded={item.gradedCount} />
              ) : (
                <span className="size-11" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          data-weight-total
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-medium tabular-nums",
            total === 100 ? "text-success-fg" : "text-warning-fg",
          )}
        >
          {total === 100 ? null : <AlertTriangle className="size-4" aria-hidden />}
          รวม {formatScore(total)}%
        </p>
        <Button type="submit" disabled={pending || data.items.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกน้ำหนัก
        </Button>
      </div>
    </form>
  );
}

/** ลบรายการกรอกเอง — คะแนนที่กรอกไว้ถูกลบด้วย จึงยืนยันก่อน */
function DeleteItemButton({ id, title, graded }: { id: string; title: string; graded: number }) {
  const { pending, run } = useAction();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-danger-fg size-11"
        aria-label={`ลบรายการ ${title}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบรายการ “{title}”?</DialogTitle>
            <DialogDescription>
              {graded > 0 ? `คะแนนที่กรอกไว้ ${graded} คนจะถูกลบด้วย และกู้คืนไม่ได้` : "ยังไม่มีใครมีคะแนนในรายการนี้"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const formData = new FormData();
                formData.set("itemId", id);
                run(deleteManualItem, formData, (result) => result.ok && setOpen(false));
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              ลบรายการ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddItemForm({ courseId }: { courseId: string }) {
  const { pending, run } = useAction();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  // เพิ่มสำเร็จแล้วล้างฟอร์มด้วยการเปลี่ยน key (ไม่อ่าน ref ระหว่าง render — React Compiler)
  const [formKey, setFormKey] = React.useState(0);

  function submit(formData: FormData) {
    run(addManualItem, formData, (result) => {
      setErrors(result.fieldErrors ?? {});
      if (result.ok) setFormKey((k) => k + 1);
    });
  }

  return (
    <form
      key={formKey}
      onSubmit={submitForm(submit)}
      aria-labelledby="add-item-title"
      className="bg-card border-border space-y-3 rounded-xl border p-4 sm:p-5"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <h2 id="add-item-title" className="text-[15px] font-semibold">
        เพิ่มรายการกรอกเอง
      </h2>
      <p className="text-muted-foreground text-[12.5px]">เช่น เข้าเรียน สอบปฏิบัติ สอบกลางภาค — กรอกคะแนนในตารางสมุดคะแนน</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label="ชื่อรายการ" name="title" required error={errors.title} />
        <Field
          label="คะแนนเต็ม"
          name="maxScore"
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          defaultValue={10}
          required
          error={errors.maxScore}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        เพิ่มรายการ
      </Button>
    </form>
  );
}

/** FR-09.6/09.8 — โหมดตัดผล + เกณฑ์ของคอร์ส (ค่าเริ่มมาจาก server: ของคอร์ส หรือของคณะ/ทั้งระบบ) */
function CourseCurveForm({ data }: { data: GradebookSettings }) {
  const [mode, setMode] = React.useState<GradingMode>(data.course.mode);
  const custom = data.course.curveSource === "course";

  return (
    <ScoreCurveForm
      title="โหมดตัดผลและเกณฑ์คะแนน"
      badge={CURVE_SOURCE_LABEL[data.course.curveSource]}
      description={
        custom
          ? "คอร์สนี้ตั้งเกณฑ์เอง ·"
          : `ตอนนี้ใช้${CURVE_SOURCE_LABEL[data.course.inheritedSource]} — แก้แล้วบันทึกเพื่อตั้งเกณฑ์เฉพาะคอร์สนี้ ·`
      }
      curve={data.course.curve}
      hidden={{ courseId: data.course.id, gradingMode: mode }}
      save={saveCourseCurve}
      reset={custom ? { label: `กลับไปใช้${CURVE_SOURCE_LABEL[data.course.inheritedSource]}`, action: resetCourseCurve } : undefined}
    >
      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold">โหมดตัดผลของคอร์ส</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(GradingMode).map((value) => (
            <label
              key={value}
              className={cn(
                "border-border flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13.5px]",
                mode === value && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                checked={mode === value}
                onChange={() => setMode(value)}
                className="accent-primary size-4"
              />
              {GRADING_MODE_LABEL[value]}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-[12px]">สมุดคะแนน หน้าคะแนนของผู้เรียน และไฟล์ส่งออกแสดงผลตามโหมดนี้ · เงื่อนไขจบคอร์สไม่เปลี่ยน</p>
      </fieldset>
    </ScoreCurveForm>
  );
}

/** เลิกตั้งทับ — ส่ง reset=true ไปกับ action เดียวกัน */
async function resetCourseCurve(formData: FormData) {
  formData.set("reset", "true");
  return saveCourseCurve(formData);
}

export function GradebookSettingsPanel({ data }: { data: GradebookSettings }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <WeightsForm key={data.items.map((i) => `${i.id}:${i.weight}`).join("|")} data={data} />
        <AddItemForm courseId={data.course.id} />
      </div>
      <CourseCurveForm key={`${data.course.mode}:${data.course.curveSource}:${JSON.stringify(data.course.curve)}`} data={data} />
    </div>
  );
}
