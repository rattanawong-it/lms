"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** ช่องข้อความหลายบรรทัดของถาม-ตอบ — label + ข้อความผิดพลาด ผูก aria ให้ครบ (แบบเดียวกับ `<Field>`) */
export function QaTextarea({
  label,
  error,
  className,
  id,
  hideLabel = false,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; error?: string; hideLabel?: boolean }) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  return (
    <div className="space-y-[7px]">
      <Label htmlFor={fieldId} className={cn("text-[12.5px] font-medium", hideLabel && "sr-only")}>
        {label}
      </Label>
      <textarea
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-danger-fg text-[12px] font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
