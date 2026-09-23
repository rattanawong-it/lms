"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { GradeSource } from "@/generated/prisma/enums";
import {
  addManualItem,
  deleteManualItem,
  saveGradeScale,
  saveWeights,
} from "@/features/gradebook/actions";
import { DEFAULT_GRADE_SCALE, weightSum } from "@/features/gradebook/lib/calc";
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

type Band = { key: number; grade: string; min: string };
let bandSeed = 0;

/** FR-09.2 — เกณฑ์ตัดเกรดของคอร์ส (เรียงจากสูงไปต่ำ · แถวสุดท้ายเริ่มที่ 0) */
function ScaleForm({ data }: { data: GradebookSettings }) {
  const { pending, run } = useAction();
  const [bands, setBands] = React.useState<Band[]>(() =>
    data.course.scale.map((b) => ({ key: (bandSeed += 1), grade: b.grade, min: String(b.min) })),
  );

  function submit(formData: FormData) {
    formData.set("bands", JSON.stringify(bands.map((b) => ({ grade: b.grade, min: b.min }))));
    run(saveGradeScale, formData);
  }

  function reset() {
    const formData = new FormData();
    formData.set("courseId", data.course.id);
    formData.set("reset", "true");
    run(saveGradeScale, formData, (result) => {
      if (result.ok) setBands(DEFAULT_GRADE_SCALE.map((b) => ({ key: (bandSeed += 1), grade: b.grade, min: String(b.min) })));
    });
  }

  return (
    <form onSubmit={submitForm(submit)} aria-labelledby="scale-title" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
      <input type="hidden" name="courseId" value={data.course.id} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="scale-title" className="text-[15px] font-semibold">
          เกณฑ์ตัดเกรด
        </h2>
        <Badge variant="secondary">{data.course.customScale ? "เกณฑ์ของคอร์สนี้" : "ค่าตั้งต้นของระบบ"}</Badge>
      </div>
      <p className="text-muted-foreground text-[12.5px]">
        ได้เกรดของแถวแรกที่คะแนนรวม (ปัด 2 ตำแหน่ง) ถึงขั้นต่ำ · เรียงจากสูงไปต่ำ แถวสุดท้ายต้องเริ่มที่ 0
      </p>

      <ol className="space-y-2">
        {bands.map((band, index) => (
          <li key={band.key} className="flex items-center gap-2">
            <Input
              value={band.grade}
              onChange={(e) => {
                const grade = e.currentTarget.value;
                setBands((list) => list.map((b) => (b.key === band.key ? { ...b, grade } : b)));
              }}
              maxLength={5}
              aria-label={`ชื่อเกรดแถวที่ ${index + 1}`}
              className="bg-card h-11 w-[80px]"
            />
            <span className="text-muted-foreground text-[13px]">ตั้งแต่</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={band.min}
              onChange={(e) => {
                const min = e.currentTarget.value;
                setBands((list) => list.map((b) => (b.key === band.key ? { ...b, min } : b)));
              }}
              aria-label={`คะแนนขั้นต่ำของเกรดแถวที่ ${index + 1}`}
              className="bg-card h-11 w-[96px] text-right tabular-nums"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`ลบเกรดแถวที่ ${index + 1}`}
              disabled={bands.length <= 2}
              onClick={() => setBands((list) => list.filter((b) => b.key !== band.key))}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={bands.length >= 15}
          onClick={() => setBands((list) => [...list, { key: (bandSeed += 1), grade: "", min: "0" }])}
        >
          <Plus className="size-4" /> เพิ่มระดับ
        </Button>
        {data.course.customScale ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={reset}>
            ใช้ค่าตั้งต้น
          </Button>
        ) : null}
        <Button type="submit" disabled={pending} className="ml-auto">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกเกณฑ์
        </Button>
      </div>
    </form>
  );
}

export function GradebookSettingsPanel({ data }: { data: GradebookSettings }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <WeightsForm key={data.items.map((i) => `${i.id}:${i.weight}`).join("|")} data={data} />
        <AddItemForm courseId={data.course.id} />
      </div>
      <ScaleForm key={data.course.scale.map((b) => `${b.grade}:${b.min}`).join("|")} data={data} />
    </div>
  );
}
