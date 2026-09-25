import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, FileBarChart, GraduationCap, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { getAdminDashboard } from "@/features/reports/queries";
import { formatRate } from "@/features/reports/lib/report";
import { EnrollmentTrend } from "@/features/reports/components/enrollment-trend";

export const metadata: Metadata = { title: "แดชบอร์ดผู้ดูแล" };

/**
 * M16 · FR-16.3 — แดชบอร์ดผู้ดูแล
 * SUPER_ADMIN เห็นทั้งระบบแยกตามคณะ · DEPT_ADMIN เห็นเฉพาะคณะตัวเอง (ตัดสินใน `getAdminDashboard()`)
 */
export default async function AdminDashboardPage() {
  const data = await getAdminDashboard();
  const isSuper = data.actor.role === Role.SUPER_ADMIN;

  return (
    <>
      <PageHeader
        title="แดชบอร์ดผู้ดูแล"
        description={`${ROLE_LABEL[data.actor.role]} · ${isSuper ? "ข้อมูลทั้งระบบ" : "เฉพาะคณะที่คุณดูแล"}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users">
                <Users className="size-4" /> จัดการผู้ใช้
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/reports">
                <FileBarChart className="size-4" /> รายงาน
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ผู้ใช้ทั้งหมด" value={data.users} icon={<Users className="size-[18px]" />} hint={isSuper ? "ทุกคณะในระบบ" : "เฉพาะคณะที่คุณดูแล"} />
        <StatCard label="ผู้ใช้ใหม่ 30 วัน" value={data.newUsers} tone="success" icon={<UserPlus className="size-[18px]" />} hint="สมัครหรือถูกนำเข้าใน 30 วันล่าสุด" />
        <StatCard
          label="คอร์สที่เผยแพร่"
          value={data.courses.published}
          tone="quiz"
          icon={<BookOpen className="size-[18px]" />}
          hint={`ทั้งหมด ${data.courses.total.toLocaleString("th-TH")} คอร์ส · รออนุมัติ ${data.courses.pending.toLocaleString("th-TH")}`}
        />
        <StatCard
          label="อัตราการเรียนจบ"
          value={formatRate(data.completionRate)}
          tone="warning"
          icon={<GraduationCap className="size-[18px]" />}
          hint={`จบ ${data.enrollments.completed.toLocaleString("th-TH")} จาก ${data.enrollments.enrolled.toLocaleString("th-TH")} การลงทะเบียน`}
        />
      </div>

      <div className="mt-5">
        <EnrollmentTrend data={data.trend} />
      </div>

      <section aria-labelledby="by-department" className="bg-card border-border mt-5 overflow-hidden rounded-xl border">
        <h2 id="by-department" className="border-line border-b px-4 py-3 text-[15px] font-semibold">
          แยกตามคณะ
        </h2>
        {data.departments.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-[13px]">ยังไม่มีคณะในขอบเขตของคุณ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <caption className="sr-only">ผู้ใช้ คอร์ส การลงทะเบียน และอัตราการเรียนจบของแต่ละคณะ</caption>
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">คณะ</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">ผู้ใช้</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">คอร์ส</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">ลงทะเบียน</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">เรียนจบ</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">อัตราการเรียนจบ</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((d) => (
                  <tr key={d.id} data-department-row className="border-line border-b last:border-0">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {d.name}
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11.5px] font-normal">{d.code}</span>
                    </th>
                    <td className="num px-4 py-3 text-right">{d.users.toLocaleString("th-TH")}</td>
                    <td className="num px-4 py-3 text-right">{d.courses.toLocaleString("th-TH")}</td>
                    <td className="num px-4 py-3 text-right">{d.enrolled.toLocaleString("th-TH")}</td>
                    <td className="num px-4 py-3 text-right">{d.completed.toLocaleString("th-TH")}</td>
                    <td className="num px-4 py-3 text-right font-semibold">{formatRate(d.completionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
