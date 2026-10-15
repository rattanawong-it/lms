import { Download, FileArchive, FileImage, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/upload-limits";

/**
 * M05 · FR-05.8 — บทเรียนเอกสารที่เป็นไฟล์ Office/รูป/ข้อความ
 *
 * ไม่มีตัวแสดงผลในเว็บ (ต่างจาก PDF ที่อ่านใน pdf.js) — ผู้เรียนดาวน์โหลดไฟล์ต้นฉบับไปเปิดเอง
 * ลิงก์ชี้ `/api/lesson-media/[lessonId]` ซึ่งตรวจสิทธิ์ทุกครั้งก่อน redirect ไป signed URL อายุสั้น
 */
const DOCUMENT_TYPE: Record<string, { label: string; icon: typeof FileText }> = {
  "application/msword": { label: "Word", icon: FileText },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word", icon: FileText },
  "application/vnd.ms-excel": { label: "Excel", icon: FileSpreadsheet },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel", icon: FileSpreadsheet },
  "application/vnd.ms-powerpoint": { label: "PowerPoint", icon: Presentation },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    label: "PowerPoint",
    icon: Presentation,
  },
  "application/zip": { label: "ZIP", icon: FileArchive },
  "image/png": { label: "รูปภาพ", icon: FileImage },
  "image/jpeg": { label: "รูปภาพ", icon: FileImage },
  "image/webp": { label: "รูปภาพ", icon: FileImage },
  "text/plain": { label: "ข้อความ", icon: FileText },
  "text/csv": { label: "CSV", icon: FileSpreadsheet },
};

export function DocumentDownload({
  lessonId,
  file,
}: {
  lessonId: string;
  file: { originalName: string; mime: string; size: bigint };
}) {
  const type = DOCUMENT_TYPE[file.mime] ?? { label: "ไฟล์", icon: FileText };
  const Icon = type.icon;

  return (
    <div className="bg-card border-border flex flex-col items-center gap-4 rounded-xl border px-5 py-8 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-xl">
        <Icon className="size-7" aria-hidden />
      </span>
      <div className="min-w-0 max-w-full">
        <p className="truncate text-[14px] font-semibold">{file.originalName}</p>
        <p className="text-muted-foreground num text-[12px]">
          {type.label} · {formatBytes(Number(file.size))}
        </p>
      </div>
      <Button asChild className="h-11 min-w-44">
        <a href={`/api/lesson-media/${lessonId}`}>
          <Download className="size-4" /> ดาวน์โหลดเอกสาร
        </a>
      </Button>
      <p className="text-muted-foreground text-[11.5px]">
        เปิดด้วยโปรแกรมที่รองรับไฟล์ชนิดนี้ เช่น Microsoft Office หรือ Google Docs
      </p>
    </div>
  );
}
