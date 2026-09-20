import { cn } from "@/lib/utils";

/** สถานะว่าง — อ้างอิง project-ui/KRIRK LMS States.dc.html */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border-border flex flex-col items-center rounded-xl border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-xl">
          {icon}
        </span>
      ) : null}
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-[420px] text-[13px] leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
