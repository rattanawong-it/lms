import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  MailWarning,
  Megaphone,
  Pin,
  Radio,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/shared/stat-card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { formatDate, formatDateTime } from "@/lib/dates";
import { announcementSource } from "@/features/announcements/components/announcement-card";
import { announcementLink } from "@/features/announcements/lib/audience";
import { getMyAnnouncements } from "@/features/announcements/queries";
import { getMyDueAssignments } from "@/features/assignments/queries";
import { getLearnerDashboard } from "@/features/reports/queries";

export const metadata: Metadata = { title: "หน้าหลัก" };

/** M16 · FR-16.1 — หน้าหลักหลังเข้าสู่ระบบ: งานที่ต้องส่ง · ประกาศ · คอร์สที่กำลังเรียน · คาบสด · ใบประกาศ */
export default async function DashboardPage() {
  const user = await requireUser();
  const isStaff = user.role === Role.SUPER_ADMIN || user.role === Role.DEPT_ADMIN;

  const [departmentCount, userCount] = isStaff
    ? await Promise.all([db.department.count(), db.user.count()])
    : [0, 0];
  // M11 · FR-11.1 — ประกาศล่าสุด 3 รายการ (ปักหมุดขึ้นก่อน)
  const announcements = await getMyAnnouncements(3);
  // M08 · FR-08.5 — งานที่ยังต้องส่ง (ส่งกลับให้แก้ขึ้นก่อน แล้วตามกำหนดส่ง)
  const dueAssignments = await getMyDueAssignments();
  // M16 · FR-16.1 — คอร์สที่กำลังเรียน · คาบเรียนสด 7 วัน · ใบประกาศล่าสุด
  const learning = await getLearnerDashboard();

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

      {dueAssignments.length > 0 ? (
        <section
          aria-labelledby="dashboard-assignments"
          className="bg-card border-border mb-5 rounded-xl border p-4 sm:p-5"
        >
          <h2 id="dashboard-assignments" className="flex items-center gap-2 text-[15px] font-semibold">
            <CalendarClock className="text-primary size-[18px]" aria-hidden /> งานที่ต้องส่ง
          </h2>
          <ul className="divide-line mt-1 divide-y">
            {dueAssignments.map((a) => (
              <li key={a.id} data-due-assignment>
                <Link
                  href={a.href as never}
                  className="hover:bg-muted/60 -mx-2 flex items-start gap-2 rounded-lg px-2 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{a.title}</span>
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {a.course.title} · {a.dueAt ? `กำหนดส่ง ${formatDateTime(a.dueAt)}` : "ไม่มีกำหนดส่ง"}
                    </span>
                  </span>
                  {a.returned ? (
                    <span className="bg-info-bg text-info-fg shrink-0 rounded-md px-2 py-0.5 text-[11.5px]">ส่งกลับให้แก้</span>
                  ) : a.overdue ? (
                    <span className="bg-danger-bg text-danger-fg shrink-0 rounded-md px-2 py-0.5 text-[11.5px]">เลยกำหนด</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="dashboard-announcements"
        className="bg-card border-border mb-5 rounded-xl border p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="dashboard-announcements"
            className="flex items-center gap-2 text-[15px] font-semibold"
          >
            <Megaphone className="text-primary size-[18px]" aria-hidden /> ประกาศล่าสุด
          </h2>
          <Link
            href="/announcements"
            className="text-primary flex min-h-11 items-center text-[12.5px] font-medium hover:underline"
          >
            ดูทั้งหมด
          </Link>
        </div>
        {announcements.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-[13px]">ยังไม่มีประกาศ</p>
        ) : (
          <ul className="divide-line mt-1 divide-y">
            {announcements.map((a) => (
              <li key={a.id}>
                <Link
                  href={announcementLink(a.id)}
                  className="hover:bg-muted/60 -mx-2 flex items-start gap-2 rounded-lg px-2 py-2.5"
                >
                  {a.pinned ? (
                    <Pin className="text-warning-fg mt-1 size-3.5 shrink-0" aria-label="ปักหมุด" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{a.title}</span>
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {announcementSource(a)} · {formatDate(a.publishedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="dashboard-courses" className="bg-card border-border min-w-0 rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="dashboard-courses" className="flex items-center gap-2 text-[15px] font-semibold">
              <BookOpen className="text-primary size-[18px]" aria-hidden /> คอร์สที่กำลังเรียน
              <span className="text-muted-foreground num text-[13px] font-normal">({learning.courseCount})</span>
            </h2>
            <Link href="/my-courses" className="text-primary flex min-h-11 items-center text-[12.5px] font-medium hover:underline">
              คอร์สของฉัน
            </Link>
          </div>
          {learning.courses.length === 0 ? (
            <div className="mt-2 text-[13px]">
              <p className="text-muted-foreground">ยังไม่มีคอร์สที่กำลังเรียน</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/courses">
                  <Search className="size-4" /> ค้นหาคอร์ส
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-line mt-1 divide-y">
              {learning.courses.map((c) => (
                <li key={c.id} data-dashboard-course className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={c.progressPct} aria-label={`ความคืบหน้า ${c.progressPct} เปอร์เซ็นต์`} className="h-1.5 flex-1" />
                      <span className="num text-muted-foreground w-10 text-right text-[12px]">{c.progressPct}%</span>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0">
                    <Link href={`/learn/${c.id}`}>
                      เรียนต่อ <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-5">
          <section aria-labelledby="dashboard-live" className="bg-card border-border rounded-xl border p-4 sm:p-5">
            <h2 id="dashboard-live" className="flex items-center gap-2 text-[15px] font-semibold">
              <Radio className="text-primary size-[18px]" aria-hidden /> คาบเรียนสด 7 วันข้างหน้า
            </h2>
            {learning.lives.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-[13px]">ไม่มีคาบเรียนสดที่กำลังจะมาถึง</p>
            ) : (
              <ul className="divide-line mt-1 divide-y">
                {learning.lives.map((l) => (
                  <li key={l.id} data-dashboard-live>
                    <Link href={`/learn/${l.course.id}/${l.id}`} className="hover:bg-muted/60 -mx-2 block rounded-lg px-2 py-2.5">
                      <span className="block truncate text-[13.5px] font-medium">{l.title}</span>
                      <span className="text-muted-foreground block truncate text-[12px]">
                        {formatDateTime(l.startAt)} · {l.course.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="dashboard-certificates" className="bg-card border-border rounded-xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-certificates" className="flex items-center gap-2 text-[15px] font-semibold">
                <Award className="text-primary size-[18px]" aria-hidden /> ใบประกาศล่าสุด
              </h2>
              <Link href="/certificates" className="text-primary flex min-h-11 items-center text-[12.5px] font-medium hover:underline">
                ดูทั้งหมด
              </Link>
            </div>
            {learning.certificates.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-[13px]">เรียนจบคอร์สที่เปิดใบประกาศแล้วจะได้รับที่นี่</p>
            ) : (
              <ul className="divide-line mt-1 divide-y">
                {learning.certificates.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <p className="truncate text-[13.5px] font-medium">{c.course.title}</p>
                    <p className="text-muted-foreground text-[12px]">
                      <span className="font-mono">{c.code}</span> · {formatDate(c.issuedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
