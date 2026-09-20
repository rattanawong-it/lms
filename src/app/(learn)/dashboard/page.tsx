import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Building2, MailWarning, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PhaseNotice } from "@/components/shared/phase-notice";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "หน้าหลัก" };

/** M16 · FR-16.1 — หน้าหลักหลังเข้าสู่ระบบ (เนื้อหาเต็มจะมาใน Phase 1) */
export default async function DashboardPage() {
  const user = await requireUser();
  const isStaff = user.role === Role.SUPER_ADMIN || user.role === Role.DEPT_ADMIN;

  const [departmentCount, userCount] = isStaff
    ? await Promise.all([db.department.count(), db.user.count()])
    : [0, 0];

  return (
    <>
      <PageHeader
        title={`สวัสดี ${user.name}`}
        description="ยินดีต้อนรับเข้าสู่ระบบจัดการเรียนรู้ของมหาวิทยาลัยเกริก"
        actions={
          isStaff ? (
            <Button asChild>
              <Link href="/admin">
                ไปที่ระบบผู้ดูแล <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null
        }
      />

      {!user.emailVerified ? (
        <div className="bg-warning-bg mb-5 flex gap-3 rounded-xl px-4 py-3.5">
          <MailWarning className="text-warning-fg mt-px size-[18px] shrink-0" />
          <div>
            <p className="text-warning-fg text-[13px] font-semibold">ยังไม่ได้ยืนยันอีเมล</p>
            <p className="text-fg-2 mt-1 text-[12px] leading-relaxed">
              กรุณากดลิงก์ยืนยันในอีเมลของคุณ หรือ{" "}
              <Link href="/verify-email" className="text-primary font-medium hover:underline">
                ขอลิงก์ยืนยันใหม่
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      {isStaff ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="ผู้ใช้ในระบบ" value={userCount} icon={<Users className="size-[18px]" />} />
          <StatCard
            label="คณะ / หน่วยงาน"
            value={departmentCount}
            tone="success"
            icon={<Building2 className="size-[18px]" />}
          />
          <StatCard
            label="บทบาทของคุณ"
            value={user.role === Role.SUPER_ADMIN ? "ผู้ดูแลสูงสุด" : "ผู้ดูแลคณะ"}
            tone="quiz"
            icon={<ShieldCheck className="size-[18px]" />}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PhaseNotice
          phase="Phase 1 – MVP"
          title="การเรียนและคอร์สกำลังพัฒนา"
          items={[
            "FR-16.1 คอร์สที่กำลังเรียน งานใกล้ครบกำหนด และ Live class ที่จะมาถึง",
            "FR-06.4 ปุ่มเรียนต่อจากบทเรียนล่าสุด",
            "FR-03.2 ค้นหาคอร์สจากคลังคอร์สทั้งหมด",
          ]}
        />

        <div className="bg-card border-border rounded-xl border p-6">
          <span className="bg-accent text-accent-foreground mb-3.5 flex size-10 items-center justify-center rounded-xl">
            <BookOpen className="size-5" />
          </span>
          <p className="text-[15px] font-semibold">สิ่งที่ใช้ได้แล้วตอนนี้</p>
          <ul className="text-fg-3 mt-3.5 space-y-2 text-[12.5px]">
            <li>
              <Link href="/settings/profile" className="text-primary hover:underline">
                แก้ไขโปรไฟล์ของคุณ
              </Link>{" "}
              — ชื่อ เบอร์โทร รหัสนักศึกษา/พนักงาน
            </li>
            <li>
              <Link href="/settings/sessions" className="text-primary hover:underline">
                ตรวจอุปกรณ์ที่เข้าสู่ระบบ
              </Link>{" "}
              — ยกเลิกอุปกรณ์ที่ไม่ใช่ของคุณได้ทันที
            </li>
            {isStaff ? (
              <li>
                <Link href="/admin/users" className="text-primary hover:underline">
                  จัดการผู้ใช้และบทบาท
                </Link>{" "}
                — ค้นหา กำหนดบทบาท ระงับบัญชี และนำเข้าจาก CSV
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </>
  );
}
