"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBase64 } from "@/components/shared/save-file";
import { exportCourseProgress, exportReport } from "@/features/reports/actions";

type Target = { kind: "report"; filters: Record<string, string> } | { kind: "course"; courseId: string };

/** FR-16.4 — ปุ่มส่งออก CSV / Excel */
export function ExportButtons({ target }: { target: Target }) {
  const [pending, setPending] = React.useState<"csv" | "xlsx" | null>(null);

  async function download(format: "csv" | "xlsx") {
    setPending(format);
    try {
      const file =
        target.kind === "report"
          ? await exportReport(target.filters, format)
          : await exportCourseProgress(target.courseId, format);
      saveBase64(file);
    } catch {
      toast.error("ส่งออกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(["csv", "xlsx"] as const).map((format) => (
        <Button
          key={format}
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void download(format)}
        >
          {pending === format ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {format === "csv" ? "ส่งออก CSV" : "ส่งออก Excel"}
        </Button>
      ))}
    </div>
  );
}
