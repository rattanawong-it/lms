import { cn } from "@/lib/utils";

/** หัวหน้าเพจมาตรฐาน — ขนาด 24–26px ตาม type scale ของ design system */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold tracking-[-0.018em]">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
