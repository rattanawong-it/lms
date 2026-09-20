import type { Metadata, Viewport } from "next";
import { Anuphan, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KRIRK LMS · ระบบจัดการเรียนรู้ออนไลน์ มหาวิทยาลัยเกริก",
    template: "%s · KRIRK LMS",
  },
  description:
    "ระบบบริหารจัดการการเรียนรู้ของมหาวิทยาลัยเกริก สำหรับนักศึกษา บุคลากร และผู้เรียนทั่วไป",
  applicationName: "KRIRK LMS",
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "KRIRK LMS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#202124" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${anuphan.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {/* shadcn รุ่นนี้ไม่ได้ใส่ TooltipProvider มาให้ใน SidebarProvider แล้ว
              จึงต้องครอบที่ root เพื่อให้ tooltip ของ sidebar ใช้งานได้ */}
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
