import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBaht } from "@/lib/payment/money";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { listReviewQueue } from "@/features/courses/queries";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE } from "@/features/courses/lib/labels";
import { formatDate } from "@/lib/dates";
import { requireAtLeast } from "@/lib/rbac";
import { Role, type CourseStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "คอร์สรออนุมัติ" };

/** M04 · FR-04.6 — คิวคอร์สที่รอคณะอนุมัติเผยแพร่ */
export default async function AdminCoursesPage() {
  await requireAtLeast(Role.DEPT_ADMIN);
  const rows = await listReviewQueue();

  return (
    <>
      <PageHeader
        title="คอร์สรออนุมัติ"
        description="FR-04.6 · คอร์สที่ผู้สอนส่งมาให้ตรวจก่อนเผยแพร่ กดเข้าไปตรวจเนื้อหาแล้วอนุมัติหรือส่งกลับให้แก้ไข"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-6" />}
          title="ไม่มีคอร์สรออนุมัติ"
          description="เมื่อผู้สอนกดส่งคอร์สให้ตรวจ รายการจะมาแสดงที่หน้านี้"
        />
      ) : (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <caption className="sr-only">คอร์สที่รออนุมัติเผยแพร่</caption>
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    คอร์ส
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    ผู้สอน
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    บทเรียน
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    ส่งเมื่อ
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-line border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-[11.5px]">
                        {row.departmentName ?? "ไม่สังกัดคณะ"}
                        {row.categoryName ? ` · ${row.categoryName}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11.5px]" data-review-price>
                        {row.price ? (
                          <span className="num font-semibold">ราคา {formatBaht(row.price)}</span>
                        ) : (
                          <span className="text-muted-foreground">เรียนฟรี</span>
                        )}
                      </p>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {row.instructorNames.join(", ") || "—"}
                    </td>
                    <td className="num px-4 py-3 text-right">{row.lessonCount}</td>
                    <td className="num text-muted-foreground px-4 py-3">
                      {formatDate(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Badge
                          variant="secondary"
                          className={COURSE_STATUS_TONE[row.status as CourseStatus]}
                        >
                          {COURSE_STATUS_LABEL[row.status as CourseStatus]}
                        </Badge>
                        <Button asChild size="sm">
                          <Link href={`/teach/courses/${row.id}`}>ตรวจคอร์ส</Link>
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
