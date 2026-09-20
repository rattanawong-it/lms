"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * ฟิลด์ฟอร์มมาตรฐาน — label + input + ข้อความผิดพลาด
 * A11y: ผูก label กับ input, ตั้ง aria-invalid และ aria-describedby ให้อัตโนมัติ
 */
type FieldProps = React.ComponentProps<"input"> & {
  label: string;
  error?: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
};

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, action, icon, className, id, ...props },
  ref,
) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="space-y-[7px]">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="text-[12.5px] font-medium">
          {label}
        </Label>
        {action}
      </div>
      <div className="relative">
        {icon ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {icon}
          </span>
        ) : null}
        <Input
          id={fieldId}
          ref={ref}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn("bg-card h-11 rounded-[9px] text-[14px]", icon && "pl-10", className)}
          {...props}
        />
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-muted-foreground text-[11.5px]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger-fg text-[12px] font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
});

/** ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน (ตาม design system) */
export const PasswordField = React.forwardRef<HTMLInputElement, Omit<FieldProps, "type">>(
  function PasswordField({ className, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Field
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-[30px] right-2 flex size-9 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          {visible ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
        </button>
      </div>
    );
  },
);
