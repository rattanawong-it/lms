import { TopBar } from "@/components/layout/top-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

/** โครงหน้าฝั่งผู้สอน — INSTRUCTOR ขึ้นไป (§4.1) */
export default async function InstructorLayout({ children }: LayoutProps<"/">) {
  const user = await requireAtLeast(Role.INSTRUCTOR);
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
