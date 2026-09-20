"use client";

import { Check, X } from "lucide-react";
import { PASSWORD_RULES, passwordStrength } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";

const TONE_BAR: Record<string, string> = {
  muted: "bg-border",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
};

const TONE_TEXT: Record<string, string> = {
  muted: "text-muted-foreground",
  danger: "text-danger-fg",
  warning: "text-warning-fg",
  info: "text-info-fg",
  success: "text-success-fg",
};

/** แถบความแข็งแรงของรหัสผ่าน + รายการเกณฑ์ (ตาม design system หน้า register/reset) */
export function PasswordStrength({ value }: { value: string }) {
  const { score, label, tone } = passwordStrength(value);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-[5px]" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-[5px] flex-1 rounded-full transition-colors",
                i <= score ? TONE_BAR[tone] : "bg-border",
              )}
            />
          ))}
        </div>
        <span className={cn("w-[62px] text-right text-[11.5px] font-semibold", TONE_TEXT[tone])}>
          {label}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {label ? `ความแข็งแรงของรหัสผ่าน: ${label}` : ""}
      </p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(value);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-[11.5px]",
                ok ? "text-success-fg" : "text-muted-foreground",
              )}
            >
              {ok ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <X className="size-3.5 shrink-0 opacity-50" />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
