import Link from "next/link";
import { Logo } from "@/components/brand/logo-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/rbac";

/** โครงหน้าสาธารณะ — ผู้เยี่ยมชมที่ยังไม่ login ก็เข้าได้ (§4.3) */
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-card border-line sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-[62px] max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="หน้าแรก KRIRK LMS">
            <Logo />
          </Link>
          <nav aria-label="เมนูสาธารณะ" className="hidden flex-1 items-center gap-1 sm:flex">
            <Link
              href="/courses"
              data-nav
              className="text-fg-3 hover:bg-muted hover:text-foreground rounded-lg px-3 py-2 text-[13px] font-medium"
            >
              คลังคอร์ส
            </Link>
          </nav>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <ThemeToggle className="text-fg-3" />
            {user ? (
              <Button asChild size="lg">
                <Link href="/dashboard">เข้าสู่ระบบแล้ว · ไปหน้าหลัก</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="lg">
                  <Link href="/login">เข้าสู่ระบบ</Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/register">สมัครสมาชิก</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-card border-line border-t">
        <div className="text-muted-foreground mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-6 text-[12px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} มหาวิทยาลัยเกริก · ระบบจัดการเรียนรู้ออนไลน์</p>
          <Link href="/privacy" className="hover:text-foreground">
            นโยบายความเป็นส่วนตัว (PDPA)
          </Link>
        </div>
      </footer>
    </div>
  );
}
