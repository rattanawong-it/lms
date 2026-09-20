import { cn } from "@/lib/utils";

/** ไอคอนหมวกบัณฑิต — ใช้ร่วมกันทุกหน้าตาม design system */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-[21px]", className)}
    >
      <path d="M2.5 8.5L12 4L21.5 8.5L12 13L2.5 8.5Z" />
      <path d="M6 10.5V16C6 16 8.5 18 12 18C15.5 18 18 16 18 16V10.5" />
      <path d="M21.5 8.9V14" />
    </svg>
  );
}

/** โลโก้พร้อมชื่อระบบ */
export function Logo({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-[9px]">
        <LogoMark className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold tracking-[-0.01em]">KRIRK LMS</span>
        {subtitle ? (
          <span className="text-muted-foreground block truncate text-[11px] leading-tight">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
