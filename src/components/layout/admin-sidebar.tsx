"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Building2,
  ClipboardList,
  FileBarChart,
  FolderTree,
  LayoutDashboard,
  Lock,
  Megaphone,
  Receipt,
  MessageSquareQuote,
  Ruler,
  ScrollText,
  Settings,
  TicketPercent,
  UploadCloud,
  Users,
  UserX,
} from "lucide-react";
import { Logo } from "@/components/brand/logo-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, type SessionUser } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  /** ยังไม่เปิดใช้ใน Phase 0 — แสดงเป็นเมนูจางพร้อมป้ายเฟส */
  phase?: string;
};

const NAV_GROUPS: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "ภาพรวม",
    items: [
      { href: "/admin", label: "แดชบอร์ด", icon: LayoutDashboard },
      { href: "/admin/reports", label: "รายงาน", icon: FileBarChart },
    ],
  },
  {
    label: "ผู้ใช้และคณะ",
    items: [
      { href: "/admin/users", label: "รายชื่อผู้ใช้", icon: Users },
      { href: "/admin/users/import", label: "นำเข้าผู้ใช้ (CSV)", icon: UploadCloud },
      {
        href: "/admin/departments",
        label: "คณะ / หน่วยงาน",
        icon: Building2,
        roles: [Role.SUPER_ADMIN],
      },
    ],
  },
  {
    label: "คอร์สและการประเมิน",
    items: [
      {
        href: "/admin/categories",
        label: "หมวดหมู่คอร์ส",
        icon: FolderTree,
        roles: [Role.SUPER_ADMIN],
      },
      { href: "/admin/courses", label: "คอร์สรออนุมัติ", icon: ClipboardList },
      { href: "/admin/certificates", label: "ใบประกาศ", icon: Award },
      { href: "/admin/reviews", label: "รีวิวคอร์ส", icon: MessageSquareQuote },
      { href: "/admin/score-curve", label: "เกณฑ์คะแนน", icon: Ruler },
    ],
  },
  {
    label: "การขาย",
    items: [
      { href: "/admin/orders", label: "คำสั่งซื้อ / คืนเงิน", icon: Receipt, roles: [Role.SUPER_ADMIN] },
      { href: "/admin/coupons", label: "คูปองส่วนลด", icon: TicketPercent, roles: [Role.SUPER_ADMIN] },
    ],
  },
  {
    label: "ระบบ",
    items: [
      { href: "/admin/announcements", label: "ประกาศ", icon: Megaphone },
      {
        href: "/admin/screen-events",
        label: "ความปลอดภัยเนื้อหา",
        icon: Lock,
        roles: [Role.SUPER_ADMIN],
      },
      {
        href: "/admin/audit",
        label: "บันทึกการใช้งาน",
        icon: ScrollText,
        roles: [Role.SUPER_ADMIN],
      },
      {
        href: "/admin/deletion-requests",
        label: "คำขอลบบัญชี",
        icon: UserX,
        roles: [Role.SUPER_ADMIN],
      },
      {
        href: "/admin/settings",
        label: "ตั้งค่าระบบ",
        icon: Settings,
        roles: [Role.SUPER_ADMIN],
      },
    ],
  },
];

/** โครงเมนูผู้ดูแล — อ้างอิง project-ui/KRIRK LMS Admin.dc.html */
export function AdminSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-sidebar-border border-b">
        <Link href="/admin" className="px-1 py-1">
          <Logo subtitle={ROLE_LABEL[user.role]} />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.roles || i.roles.includes(user.role));
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active =
                      item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                    if (item.phase) {
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            disabled
                            tooltip={`${item.label} — เปิดใช้ใน${item.phase}`}
                            className="opacity-55"
                          >
                            <item.icon className="size-4" />
                            <span className="flex-1">{item.label}</span>
                            <Badge variant="secondary" className="text-[9.5px]">
                              {item.phase}
                            </Badge>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link href={item.href} aria-current={active ? "page" : undefined}>
                            <item.icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="กลับหน้าผู้เรียน">
              <Link href="/dashboard">
                <LayoutDashboard className="size-4" />
                <span>กลับหน้าผู้เรียน</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
