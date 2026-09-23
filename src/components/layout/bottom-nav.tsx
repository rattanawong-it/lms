"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Home, Megaphone, User } from "lucide-react";
import { MOBILE_NAV } from "@/components/layout/main-nav";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home,
  book: BookOpen,
  bell: Bell,
  megaphone: Megaphone,
  user: User,
  teach: BookOpen,
  admin: BookOpen,
} as const;

/**
 * NFR-01 · แถบเมนูล่างบนมือถือ (< 768px) — touch target 44px+
 * อ้างอิง project-ui/KRIRK LMS Mobile.dc.html
 */
export function BottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูหลัก (มือถือ)"
      className="bg-card border-line fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {MOBILE_NAV.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-nav
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-[21px]" />
                  {item.icon === "bell" && unreadCount > 0 ? (
                    <span className="bg-destructive absolute -top-1 -right-2 flex min-w-[16px] justify-center rounded-full px-1 text-[9px] leading-4 font-semibold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
