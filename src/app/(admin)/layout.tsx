import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

/**
 * โครงหน้าผู้ดูแล — sidebar ซ้าย + แถบบน (system-design §8.1)
 * มือถือ: sidebar ยุบเป็น drawer ผ่าน SidebarTrigger
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const user = await requireAtLeast(Role.DEPT_ADMIN);

  return (
    <SidebarProvider>
      <AdminSidebar user={user} />
      <SidebarInset>
        <header className="bg-card border-line sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 sm:px-5">
          <SidebarTrigger aria-label="สลับเมนูผู้ดูแล" />
          <span className="text-muted-foreground truncate text-[13px]">ระบบผู้ดูแล</span>
          <div className="flex flex-1 items-center justify-end gap-1">
            <ThemeToggle className="text-fg-3" />
            <UserMenu user={user} />
          </div>
        </header>
        <div className="flex-1 px-4 py-5 sm:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
