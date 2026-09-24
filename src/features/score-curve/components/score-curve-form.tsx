"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import {
  checkCurve,
  CURVE_SECTION_LABEL,
  MAX_CURVE_BANDS,
  type CurveBand,
  type CurveSection,
  type ScoreCurveData,
} from "@/features/gradebook/lib/curve";

/**
 * M09 · FR-09.6/09.9 — ตัวแก้ Score Curve 2 ส่วน (เกรด · ผ่าน/ไม่ผ่าน)
 * ค่าเริ่มมาจาก server เสมอ (ไม่มีค่าเกณฑ์ในไฟล์นี้) · ตรวจสดด้วย `checkCurve()` ตัวเดียวกับ server แล้วกันไม่ให้บันทึกถ้ายังผิด
 */

type Row = { key: number; label: string; min: string; max: string };
type Rows = Record<CurveSection, Row[]>;

let rowSeed = 0;
const toRows = (bands: readonly CurveBand[]): Row[] =>
  bands.map((b) => ({ key: (rowSeed += 1), label: b.label, min: String(b.min), max: String(b.max) }));

/** ช่องว่างต้องเป็น "ไม่ใช่ตัวเลข" — Number("") ได้ 0 */
const num = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));
const toBands = (rows: readonly Row[]): CurveBand[] =>
  rows.map((r) => ({ label: r.label, min: num(r.min), max: num(r.max) }));

type Props = {
  title: string;
  badge?: string;
  description?: React.ReactNode;
  curve: ScoreCurveData;
  /** ช่อง hidden ที่ action ต้องใช้ เช่น scope / courseId */
  hidden: Record<string, string>;
  save: (formData: FormData) => Promise<ActionResult>;
  reset?: { label: string; action: (formData: FormData) => Promise<ActionResult> };
  /** ช่องเพิ่มเติมในฟอร์มเดียวกัน (เช่น โหมดตัดผลของคอร์ส) */
  children?: React.ReactNode;
};

export function ScoreCurveForm({ title, badge, description, curve, hidden, save, reset, children }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [rows, setRows] = React.useState<Rows>(() => ({
    grades: toRows(curve.grades),
    passFail: toRows(curve.passFail),
  }));
  const issues = {
    grades: checkCurve(toBands(rows.grades)),
    passFail: checkCurve(toBands(rows.passFail)),
  };
  const valid = !issues.grades && !issues.passFail;
  const titleId = React.useId();

  function run(action: (formData: FormData) => Promise<ActionResult>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function submit(formData: FormData) {
    if (!valid) {
      toast.error("ช่วงคะแนนยังไม่ถูกต้อง — แก้ตามข้อความสีแดงก่อนบันทึก");
      return;
    }
    formData.set("curve", JSON.stringify({ grades: toBands(rows.grades), passFail: toBands(rows.passFail) }));
    run(save, formData);
  }

  function update(section: CurveSection, key: number, patch: Partial<Row>) {
    setRows((all) => ({ ...all, [section]: all[section].map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  return (
    <form
      onSubmit={submitForm(submit)}
      aria-labelledby={titleId}
      data-score-curve
      className="bg-card border-border space-y-5 rounded-xl border p-4 sm:p-5"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </div>
        <p className="text-muted-foreground text-[12.5px]">
          {description} ตัดผลจากคะแนนรวมที่<strong className="text-foreground font-medium">ตัดทศนิยมทิ้ง</strong> เช่น 79.50 นับเป็น 79
        </p>
      </div>

      {children}

      {(["grades", "passFail"] as const).map((section) => (
        <SectionEditor
          key={section}
          section={section}
          rows={rows[section]}
          issue={issues[section]}
          canResize={section === "grades"}
          onChange={(key, patch) => update(section, key, patch)}
          onAdd={() =>
            setRows((all) => ({ ...all, [section]: [...all[section], { key: (rowSeed += 1), label: "", min: "", max: "" }] }))
          }
          onRemove={(key) => setRows((all) => ({ ...all, [section]: all[section].filter((r) => r.key !== key) }))}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {reset ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const formData = new FormData();
              for (const [name, value] of Object.entries(hidden)) formData.set(name, value);
              run(reset.action, formData);
            }}
          >
            {reset.label}
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

function SectionEditor({
  section,
  rows,
  issue,
  canResize,
  onChange,
  onAdd,
  onRemove,
}: {
  section: CurveSection;
  rows: Row[];
  issue: ReturnType<typeof checkCurve>;
  canResize: boolean;
  onChange: (key: number, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
}) {
  const name = CURVE_SECTION_LABEL[section];
  const statusId = `curve-${section}-status`;

  return (
    <fieldset data-curve-section={section} className="space-y-2" aria-describedby={statusId}>
      <legend className="text-[14px] font-semibold">{name}</legend>

      <div className="text-muted-foreground grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 px-0.5 text-[12px]">
        <span>ชื่อ</span>
        <span>Min</span>
        <span>Max</span>
        <span className="sr-only">ลบ</span>
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const invalid = issue?.rows.includes(index) ?? false;
          const label = row.label.trim() || `แถวที่ ${index + 1}`;
          return (
            <li
              key={row.key}
              data-curve-row
              className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2"
            >
              <Input
                value={row.label}
                onChange={(e) => {
                  // อ่านค่าก่อน — updater ทำงานทีหลัง ตอนนั้น currentTarget เป็น null แล้ว
                  const value = e.currentTarget.value;
                  onChange(row.key, { label: value });
                }}
                maxLength={5}
                aria-label={`ชื่อ${name} แถวที่ ${index + 1}`}
                aria-invalid={invalid || undefined}
                className="bg-card h-11 px-2 text-center font-semibold"
              />
              {(["min", "max"] as const).map((field) => (
                <Input
                  key={field}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  value={row[field]}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    onChange(row.key, { [field]: value });
                  }}
                  aria-label={`${field === "min" ? "Min" : "Max"} ของ ${label}`}
                  aria-invalid={invalid || undefined}
                  className="bg-card h-11 text-right tabular-nums"
                />
              ))}
              {canResize ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`ลบ ${label}`}
                  disabled={rows.length <= 2}
                  onClick={() => onRemove(row.key)}
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <span aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <p
          id={statusId}
          role="status"
          data-curve-status
          className={cn(
            "flex min-h-6 flex-1 items-start gap-1.5 text-[12.5px]",
            issue ? "text-danger-fg" : "text-success-fg",
          )}
        >
          {issue ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {issue ? issue.message : "ช่วงคะแนนครบ 0–100 และไม่ซ้อนทับ"}
        </p>
        {canResize ? (
          <Button type="button" variant="outline" disabled={rows.length >= MAX_CURVE_BANDS} onClick={onAdd}>
            <Plus className="size-4" /> เพิ่มระดับ
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}
