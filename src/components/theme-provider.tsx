"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * สลับโหมดสว่าง/มืดตาม design system (ทุกไฟล์ UI มีสวิตช์ดาร์กโหมด)
 * `nonce` มาจาก CSP ที่ `proxy.ts` ออกให้ต่อ request — ถ้าไม่ส่ง สคริปต์กันจอกะพริบจะถูกบล็อก
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
