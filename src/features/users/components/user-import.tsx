"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmUserImport, previewUserImport, type ImportPreview } from "@/features/users/actions";
import { SAMPLE_CSV } from "@/features/users/lib/csv";
import { cn } from "@/lib/utils";

const STATUS_STYLE = {
  ok: { label: "พร้อมนำเข้า", className: "bg-success-bg text-success-fg" },
  skip: { label: "ข้าม", className: "bg-warning-bg text-warning-fg" },
  error: { label: "ผิดพลาด", className: "bg-danger-bg text-danger-fg" },
} as const;

/** M02 · FR-02.5 — นำเข้าผู้ใช้แบบกลุ่มจากไฟล์ CSV (ตรวจก่อนยืนยัน) */
export function UserImport() {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [csv, setCsv] = React.useState("");
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [pending, startTransition] = React.useTransition();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("ไฟล์ใหญ่เกิน 2 MB");
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setPreview(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("csv", text);
      const result = await previewUserImport(formData);
      setPreview(result);
      if (result.errorCount > 0) toast.error(result.message);
      else toast.success(result.message);
    });
  }

  function confirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("csv", csv);
      const result = await confirmUserImport(formData);
      if (result.ok) {
        toast.success(result.message);
        setCsv("");
        setFileName(null);
        setPreview(null);
        router.push("/admin/users");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function downloadSample() {
    const blob = new Blob([`﻿${SAMPLE_CSV}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "krirk-lms-users-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="bg-card border-border rounded-xl border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">1 · เตรียมไฟล์</h2>
            <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
              ไฟล์ CSV ต้องมีหัวตาราง <span className="num">name, email, role, department, externalId</span>{" "}
              โดย <span className="num">role</span> เป็นหนึ่งใน STUDENT / INSTRUCTOR / DEPT_ADMIN
              และ <span className="num">department</span> คือรหัสคณะ
            </p>
          </div>
          <Button type="button" variant="outline" onClick={downloadSample} className="shrink-0">
            <Download className="size-4" /> ดาวน์โหลดไฟล์ตัวอย่าง
          </Button>
        </div>
      </div>

      <div className="bg-card border-border rounded-xl border p-5">
        <h2 className="text-[15px] font-semibold">2 · อัปโหลดและตรวจข้อมูล</h2>
        <p className="text-muted-foreground mt-1 mb-4 text-[12.5px]">
          ระบบจะตรวจทุกแถวก่อน และจะนำเข้าได้ก็ต่อเมื่อไม่มีแถวที่ผิดพลาด
        </p>

        <label
          className={cn(
            "border-border hover:border-ring flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
            pending && "pointer-events-none opacity-60",
          )}
        >
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
          <span className="bg-accent text-accent-foreground mb-3 flex size-11 items-center justify-center rounded-xl">
            {pending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
          <span className="text-[13.5px] font-medium">
            {fileName ?? "เลือกไฟล์ CSV หรือลากมาวางที่นี่"}
          </span>
          <span className="text-muted-foreground mt-1 text-[11.5px]">ขนาดไม่เกิน 2 MB</span>
        </label>
      </div>

      {preview ? (
        <div className="bg-card border-border rounded-xl border">
          <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-2.5">
              {preview.errorCount > 0 ? (
                <AlertCircle className="text-danger-fg size-[18px]" />
              ) : (
                <CheckCircle2 className="text-success-fg size-[18px]" />
              )}
              <div>
                <h2 className="text-[15px] font-semibold">3 · ตรวจสอบผลและยืนยัน</h2>
                <p className="text-muted-foreground text-[12.5px]">{preview.message}</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={confirm}
              disabled={pending || preview.errorCount > 0 || preview.validCount === 0}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              ยืนยันนำเข้า {preview.validCount} รายชื่อ
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">บรรทัด</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">ชื่อ</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">อีเมล</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">บทบาท</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">คณะ</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const style = STATUS_STYLE[row.status];
                  return (
                    <tr key={row.line} className="border-line border-b last:border-0">
                      <td className="num text-muted-foreground px-4 py-2.5">{row.line}</td>
                      <td className="px-4 py-2.5">{row.values.name ?? "—"}</td>
                      <td className="num px-4 py-2.5">{row.values.email ?? "—"}</td>
                      <td className="num px-4 py-2.5">{row.values.role ?? "STUDENT"}</td>
                      <td className="num px-4 py-2.5">{row.values.departmentCode ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className={style.className}>
                          {style.label}
                        </Badge>
                        {row.error ? (
                          <span className="text-muted-foreground mt-1 block text-[11px]">
                            {row.error}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-muted/40 border-border text-muted-foreground flex items-center gap-3 rounded-xl border border-dashed px-5 py-6 text-[12.5px]">
          <FileSpreadsheet className="size-5 shrink-0" />
          ผลการตรวจไฟล์จะแสดงที่นี่หลังอัปโหลด
        </div>
      )}
    </div>
  );
}
