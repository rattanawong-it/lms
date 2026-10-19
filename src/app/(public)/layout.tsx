import Link from "next/link";
import { Logo } from "@/components/brand/logo-mark";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { getSessionUser } from "@/lib/rbac";

/**
 * โครงหน้าสาธารณะ — ผู้เยี่ยมชมที่ยังไม่ login ก็เข้าได้ (§4.3)
 * ผู้ที่ล็อกอินแล้วเห็นเมนูหลักชุดเดียวกับ layout `(learn)` ไม่ใช่หัวเว็บสาธารณะ
 * (ไม่งั้นกดเข้าคลังคอร์สแล้วเมนูอื่นหายหมด)
 */
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const unreadCount = user ? await getUnreadNotificationCount() : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {user ? (
        <TopBar user={user} unreadCount={unreadCount} />
      ) : (
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
              <Button asChild variant="ghost" size="lg">
                <Link href="/login">เข้าสู่ระบบ</Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/register">สมัครสมาชิก</Link>
              </Button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1">{children}</main>

      {/* เว้นที่ให้ bottom nav บนมือถือ ไม่ให้บังลิงก์ท้ายหน้า */}
      <footer
        className={
          user ? "bg-card border-line border-t pb-16 md:pb-0" : "bg-card border-line border-t"
        }
      >
        <div className="text-muted-foreground mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-6 text-[12px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} มหาวิทยาลัยเกริก · ระบบจัดการเรียนรู้ออนไลน์</p>
          <Link href="/privacy" className="hover:text-foreground">
            นโยบายความเป็นส่วนตัว (PDPA)
          </Link>
        </div>
      </footer>
      {user ? <BottomNav unreadCount={unreadCount} /> : null}
    </div>
  );
}
