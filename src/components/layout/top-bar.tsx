"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { MAIN_NAV, visibleNav } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * แถบบนสำหรับผู้เรียน/ผู้สอน — อ้างอิง project-ui/KRIRK LMS Learner.dc.html
 * มือถือ: แสดงเฉพาะโลโก้ + กระดิ่ง + เมนูผู้ใช้ (เมนูหลักย้ายไป bottom nav)
 */
export function TopBar({ user, unreadCount = 0 }: { user: SessionUser; unreadCount?: number }) {
  const pathname = usePathname();
  const items = visibleNav(MAIN_NAV, user.role);

  return (
    <header className="bg-card border-line sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-[62px] max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="shrink-0" aria-label="ไปหน้าหลัก KRIRK LMS">
          <Logo />
        </Link>

        <nav aria-label="เมนูหลัก" className="hidden items-center gap-0.5 lg:flex">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-nav
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-fg-3 hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/courses"
          className="bg-background border-border text-muted-foreground hover:border-ring hidden h-9 max-w-[340px] flex-1 items-center gap-2.5 rounded-full border px-3.5 text-[12.5px] transition-colors md:flex"
        >
          <Search className="size-[15px]" />
          ค้นหาคอร์ส ผู้สอน หรือหัวข้อ
        </Link>

        <div className="flex flex-1 items-center justify-end gap-1">
          <ThemeToggle className="text-fg-3" />

          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-fg-3 relative"
            aria-label={
              unreadCount > 0 ? `การแจ้งเตือน ${unreadCount} รายการที่ยังไม่อ่าน` : "การแจ้งเตือน"
            }
          >
            <Link href="/notifications">
              <Bell className="size-[19px]" />
              {unreadCount > 0 ? (
                <span className="bg-destructive absolute top-0.5 right-0.5 flex min-w-[17px] items-center justify-center rounded-full px-1 text-[9.5px] leading-[15px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          </Button>

          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
