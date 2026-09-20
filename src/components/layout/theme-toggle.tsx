"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * สวิตช์โหมดสว่าง/มืด (มีอยู่ในทุกหน้าจอของ design system)
 * สลับไอคอนด้วย CSS variant `dark:` ไม่ใช่ state ฝั่ง client
 * จึงไม่ต้องรอ mount และไม่เกิด hydration mismatch
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label="สลับโหมดสว่างและโหมดมืด"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-[18px] dark:hidden" />
      <Moon className="hidden size-[18px] dark:block" />
    </Button>
  );
}
