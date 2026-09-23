import { TopBar } from "@/components/layout/top-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { requireUser } from "@/lib/rbac";

/**
 * โครงหน้าฝั่งผู้ใช้ที่ล็อกอินแล้ว (system-design §8.1)
 * มือถือ: top bar + bottom nav · เดสก์ท็อป: top bar + เมนูแนวนอน
 */
export default async function LearnLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unreadCount = await getUnreadNotificationCount();

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} unreadCount={unreadCount} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-5 pb-24 sm:px-6 md:pb-10">
        {children}
      </main>
      <BottomNav unreadCount={unreadCount} />
    </div>
  );
}
