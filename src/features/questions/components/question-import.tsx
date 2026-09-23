"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  confirmQuestionImport,
  downloadQuestionTemplate,
  previewQuestionImport,
  type QuestionImportPreview,
} from "@/features/questions/actions";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, QUESTION_TYPE_LABEL } from "@/features/questions/schemas";
import { saveBase64 } from "@/components/shared/save-file";

/** M07 · FR-07.7 — นำเข้าข้อสอบจาก CSV หรือ Excel (ตรวจทุกแถวก่อนยืนยัน) */
export function QuestionImport({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<QuestionImportPreview | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputId = React.useId();

  function formWith(selected: File) {
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.set("file", selected);
    return formData;
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selected) return;
    if (selected.size > IMPORT_MAX_BYTES) {
      toast.error("ไฟล์ใหญ่เกิน 900 KB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละส่วน");
      return;
    }
    setFile(selected);
    setPreview(null);
    startTransition(async () => {
      const result = await previewQuestionImport(formWith(selected));
      setPreview(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function confirm() {
    if (!file) return;
    startTransition(async () => {
      const result = await confirmQuestionImport(formWith(file));
      if (result.ok) {
        toast.success(result.message);
        onDone();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function template(format: "csv" | "xlsx") {
    startTransition(async () => saveBase64(await downloadQuestionTemplate(format)));
  }

  return (
    <div className="space-y-4">
      <div className="text-fg-2 space-y-1.5 text-[12.5px] leading-relaxed">
        <p>
          แถวแรกเป็นหัวตาราง: <strong>ชนิด, โจทย์, ตัวเลือก, คำตอบ, คะแนน, แท็ก, คำอธิบายเฉลย</strong> ·
          นำเข้าได้ครั้งละไม่เกิน {IMPORT_MAX_ROWS} ข้อ
        </p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>ตัวเลือกคั่นด้วย | · คำตอบของปรนัยใส่ลำดับตัวเลือก เช่น 2 หรือ 1,3</li>
          <li>ข้อจับคู่เขียนตัวเลือกเป็น ซ้าย=ขวา|ซ้าย=ขวา · ข้อถูก/ผิดใส่คำตอบว่า ถูก หรือ ผิด</li>
          <li>ข้อเติมคำใส่คำตอบที่ยอมรับได้หลายแบบคั่นด้วย | · ข้ออัตนัยเว้นตัวเลือกและคำตอบว่าง</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => template("xlsx")} disabled={pending}>
          <Download className="size-4" /> แม่แบบ Excel (.xlsx)
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => template("csv")} disabled={pending}>
          <Download className="size-4" /> แม่แบบ CSV
        </Button>
      </div>

      <label
        htmlFor={inputId}
        className="border-border hover:border-ring flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors"
      >
        {pending && !preview ? (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        ) : (
          <FileSpreadsheet className="text-muted-foreground size-5" />
        )}
        <span className="text-[13px] font-medium">{file ? file.name : "เลือกไฟล์ .xlsx หรือ .csv"}</span>
        <span className="text-muted-foreground text-[11.5px]">ขนาดไม่เกิน 900 KB</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={choose}
        aria-label="เลือกไฟล์ข้อสอบ"
      />

      {preview && preview.rows.length > 0 ? (
        <div className="border-border max-h-[300px] overflow-y-auto rounded-lg border">
          <ul className="divide-line divide-y text-[12.5px]">
            {preview.rows.map((row) => (
              <li key={row.line} data-import-row className="flex items-start gap-2.5 px-3 py-2">
                <span className="text-muted-foreground w-12 shrink-0 tabular-nums">แถว {row.line}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.preview || "(ไม่มีโจทย์)"}</span>
                  {row.error ? (
                    <span className="text-danger-fg block">{row.error}</span>
                  ) : row.type ? (
                    <span className="text-muted-foreground block">{QUESTION_TYPE_LABEL[row.type]}</span>
                  ) : null}
                </span>
                <Badge
                  className={cn(
                    "shrink-0 border-0",
                    row.ok ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg",
                  )}
                >
                  {row.ok ? "พร้อม" : "ผิดพลาด"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview && !preview.ok && preview.rows.length === 0 ? (
        <p role="alert" className="text-danger-fg text-[12.5px] font-medium">
          {preview.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="button" onClick={confirm} disabled={pending || !preview?.ok}>
          {pending && preview ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {preview?.ok ? `นำเข้า ${preview.validCount} ข้อ` : "นำเข้า"}
        </Button>
      </div>
    </div>
  );
}
