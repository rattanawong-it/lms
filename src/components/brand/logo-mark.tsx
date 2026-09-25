"use client";

import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/rich-text-doc";
import { useBranding } from "@/components/brand/branding-provider";

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

/** โลโก้พร้อมชื่อระบบ — ชื่อ/รูปตามที่ตั้งไว้ที่ /admin/settings (FR-17.3) */
export function Logo({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  const { name, logoAssetId } = useBranding();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {logoAssetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- รูปจาก /api/media ขนาดเล็ก แคชที่ route อยู่แล้ว
        <img src={mediaSrc(logoAssetId)} alt="" className="size-8 shrink-0 rounded-[9px] object-contain" />
      ) : (
        <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-[9px]">
          <LogoMark className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em]">{name}</span>
        {subtitle ? (
          <span className="text-muted-foreground block truncate text-[11px] leading-tight">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
