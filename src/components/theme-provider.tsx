"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** สลับโหมดสว่าง/มืดตาม design system (ทุกไฟล์ UI มีสวิตช์ดาร์กโหมด) */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
