import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-accent text-accent-foreground",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  quiz: "bg-quiz-bg text-quiz-fg",
} as const;

/** การ์ดสถิติ — แพตเทิร์นที่ใช้ซ้ำทุกแดชบอร์ดใน design system */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="bg-card border-border rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-[12.5px]">{label}</p>
          <p className="num mt-1.5 text-[26px] leading-none font-bold tracking-[-0.02em]">
            {typeof value === "number" ? value.toLocaleString("th-TH") : value}
          </p>
        </div>
        {icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-muted-foreground mt-2.5 text-[11.5px]">{hint}</p> : null}
    </div>
  );
}
