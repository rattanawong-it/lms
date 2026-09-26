import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardCheck, MessagesSquare, Plus, Search, SearchX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { getTeachDashboard } from "@/features/reports/queries";
import { formatRate } from "@/features/reports/lib/report";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE } from "@/features/courses/lib/labels";
import { formatDate } from "@/lib/dates";
import type { CourseStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "ห้องผู้สอน" };

/** M04 · FR-04.1 — รายการคอร์สที่ผู้ใช้ดูแลได้ · M16 · FR-16.2 — ตัวเลขต่อคอร์ส */
export default async function TeachPage(props: PageProps<"/teach">) {
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q : "";
  const { courses, totals } = await getTeachDashboard(q);

  return (
    <>
      <PageHeader
        title="ห้องผู้สอน"
        description="คอร์สที่คุณเป็นผู้สอน หรืออยู่ในคณะที่คุณดูแล"
        actions={
          <Button asChild>
            <Link href="/teach/courses/new">
              <Plus className="size-4" /> สร้างคอร์ส
            </Link>
          </Button>
        }
      />

      {courses.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="ผู้เรียนในคอร์สที่แสดง" value={totals.learners} icon={<Users className="size-[18px]" />} hint="ไม่รวมรออนุมัติและถอนตัว" />
          <StatCard
            label="งาน/ข้อสอบรอตรวจ"
            value={totals.pendingGrading}
            tone="warning"
            icon={<ClipboardCheck className="size-[18px]" />}
            hint="งานส่งครั้งล่าสุด + ข้อสอบอัตนัย"
          />
          <StatCard
            label="คำถามที่ยังไม่มีคำตอบ"
            value={totals.openQuestions}
            tone="quiz"
            icon={<MessagesSquare className="size-[18px]" />}
            hint="กระทู้ถาม-ตอบที่ยังไม่มีใครตอบ"
          />
        </div>
      ) : null}

      <form role="search" className="mb-4 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="ค้นหาจากชื่อคอร์ส"
          aria-label="ค้นหาคอร์ส"
          className="bg-card h-11 max-w-[420px]"
        />
        <Button type="submit" variant="outline" className="h-11">
          <Search className="size-4" /> ค้นหา
        </Button>
      </form>

      {courses.length === 0 && q ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="ไม่พบคอร์สที่ตรงกับคำค้น"
          description={`ไม่มีคอร์สชื่อที่มี “${q}” ในคอร์สที่คุณดูแลได้`}
        />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="ยังไม่มีคอร์สของคุณ"
          description="สร้างคอร์สแรก แล้วเพิ่มบทเรียนเข้าไป เมื่อพร้อมจึงส่งให้คณะอนุมัติเผยแพร่"
          action={
            <Button asChild>
              <Link href="/teach/courses/new">
                <Plus className="size-4" /> สร้างคอร์สแรก
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <caption className="sr-only">รายการคอร์สที่คุณดูแลได้</caption>
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    คอร์ส
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    สถานะ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    บทเรียน
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    ผู้เรียน
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    เรียนจบ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    รอตรวจ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    คำถามรอตอบ
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    แก้ไขล่าสุด
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-line border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/teach/courses/${course.id}`}
                        className="hover:text-ring font-medium"
                      >
                        {course.title}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 text-[11.5px]">
                        {course.categoryName ?? "ยังไม่จัดหมวด"}
                        {course.departmentName ? ` · ${course.departmentName}` : ""}
                        {course.isOwnCourse ? "" : " · คอร์สในคณะที่คุณดูแล"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={COURSE_STATUS_TONE[course.status as CourseStatus]}
                      >
                        {COURSE_STATUS_LABEL[course.status as CourseStatus]}
                      </Badge>
                    </td>
                    <td className="num px-4 py-3 text-right">{course.lessonCount}</td>
                    <td className="num px-4 py-3 text-right">
                      {course.learners.toLocaleString("th-TH")}
                      {course.buyers > 0 ? (
                        <span className="text-muted-foreground block text-[11.5px]" data-buyers>
                          ผู้ซื้อ {course.buyers.toLocaleString("th-TH")}
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-4 py-3 text-right" data-completion>{formatRate(course.completionRate)}</td>
                    <td className="num px-4 py-3 text-right">
                      {course.pendingSubmissions + course.pendingAttempts > 0 ? (
                        <Link
                          href={
                            course.pendingSubmissions > 0
                              ? `/teach/courses/${course.id}/assignments/review`
                              : `/teach/courses/${course.id}/quizzes/review`
                          }
                          className="text-warning-fg font-semibold hover:underline"
                          aria-label={`รอตรวจ ${course.pendingSubmissions} งาน ${course.pendingAttempts} ข้อสอบ`}
                        >
                          {course.pendingSubmissions + course.pendingAttempts}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {course.openQuestions > 0 ? (
                        <Link href={`/teach/courses/${course.id}/qa`} className="text-quiz-fg font-semibold hover:underline">
                          {course.openQuestions}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="num text-muted-foreground px-4 py-3">
                      {formatDate(course.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/teach/courses/${course.id}/curriculum`}>สารบัญ</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/teach/courses/${course.id}`}>ตั้งค่า</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
