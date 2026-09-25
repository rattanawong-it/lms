"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Award, LayoutDashboard, LogOut, Receipt, Settings, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/roles";
import { ROLE_LABEL } from "@/lib/roles";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const isStaff = user.role === "SUPER_ADMIN" || user.role === "DEPT_ADMIN";
  const isTeacher = isStaff || user.role === "INSTRUCTOR";

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("ออกจากระบบแล้ว");
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2.5 rounded-full p-1 pr-2.5 focus-visible:ring-2 focus-visible:outline-none"
        aria-label="เมนูบัญชีผู้ใช้"
      >
        <Avatar className="size-[30px]">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="bg-accent text-accent-foreground text-[12px] font-semibold">
            {user.name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-left sm:block">
          <span className="block text-[12.5px] leading-tight font-medium">{user.name}</span>
          <span className="text-muted-foreground block text-[10.5px] leading-tight">
            {ROLE_LABEL[user.role]}
          </span>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-[13px] font-semibold">{user.name}</p>
          <p className="text-muted-foreground text-[11.5px]">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="size-4" /> หน้าหลัก
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/certificates">
            <Award className="size-4" /> ใบประกาศของฉัน
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/orders">
            <Receipt className="size-4" /> คำสั่งซื้อของฉัน
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <User className="size-4" /> โปรไฟล์ของฉัน
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/sessions">
            <Settings className="size-4" /> อุปกรณ์ที่เข้าสู่ระบบ
          </Link>
        </DropdownMenuItem>
        {isTeacher ? (
          <DropdownMenuItem asChild>
            <Link href={isStaff ? "/admin" : "/teach"}>
              <ShieldCheck className="size-4" />
              {isStaff ? "ระบบผู้ดูแล" : "ห้องผู้สอน"}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} variant="destructive">
          <LogOut className="size-4" /> ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
