"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "โปรไฟล์" },
  { href: "/settings/sessions", label: "อุปกรณ์ที่เข้าสู่ระบบ" },
  { href: "/settings/notifications", label: "การแจ้งเตือน" },
  { href: "/settings/line", label: "LINE" },
  { href: "/settings/privacy", label: "ความเป็นส่วนตัว" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="หมวดการตั้งค่า"
      className="border-line mb-5 flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-primary"
                : "text-fg-3 hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
