import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ShieldAlert, UserCheck, UploadCloud, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { userStats } from "@/features/users/queries";
import { ROLE_LABEL } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "แดชบอร์ดผู้ดูแล" };

/** M16 · FR-16.3 (ส่วนผู้ใช้) — ตัวเลขที่ใช้ได้จริงตั้งแต่ Phase 0 */
export default async function AdminDashboardPage() {
  const stats = await userStats();
  const isSuper = stats.actor.role === Role.SUPER_ADMIN;

  return (
    <>
      <PageHeader
        title="แดชบอร์ดผู้ดูแล"
        description={`${ROLE_LABEL[stats.actor.role]} · ข้อมูลในขอบเขตที่คุณดูแลได้`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users/import">
                <UploadCloud className="size-4" /> นำเข้าผู้ใช้
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/users">
                <Users className="size-4" /> จัดการผู้ใช้
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ผู้ใช้ทั้งหมด"
          value={stats.total}
          icon={<Users className="size-[18px]" />}
          hint={isSuper ? "ทุกคณะในระบบ" : "เฉพาะคณะที่คุณดูแล"}
        />
        <StatCard
          label="ผู้สอน"
          value={stats.instructors}
          tone="quiz"
          icon={<UserCheck className="size-[18px]" />}
          hint="บทบาท INSTRUCTOR"
        />
        <StatCard
          label="รอยืนยันอีเมล"
          value={stats.unverified}
          tone="warning"
          icon={<UserCheck className="size-[18px]" />}
          hint="ยังเข้าสู่ระบบด้วยรหัสผ่านไม่ได้"
        />
        <StatCard
          label="บัญชีที่ถูกระงับ"
          value={stats.banned}
          tone="danger"
          icon={<ShieldAlert className="size-[18px]" />}
          hint="FR-02.4"
        />
      </div>

      {isSuper ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <StatCard
            label="คณะ / หน่วยงาน"
            value={stats.departments}
            tone="success"
            icon={<Building2 className="size-[18px]" />}
            hint="FR-02.1 · โครงสร้างองค์กร"
          />
          <div className="bg-card border-border flex flex-col justify-center rounded-xl border p-4">
            <p className="text-[13px] font-semibold">ขั้นต่อไปของระบบ</p>
            <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
              Phase 0 เปิดใช้ระบบบัญชีและโครงสร้างองค์กรแล้ว · เฟสถัดไปคือ Catalog, Course Builder
              และหน้าเรียน (M03–M06)
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
