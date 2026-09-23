import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Inbox, Pencil, Plus, Settings, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { DeleteAssignmentButton } from "@/features/assignments/components/delete-assignment-button";
import { getCourseAssignments } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "งานที่ต้องส่ง" };

/** M08 · FR-08.1 / FR-08.5 — งานที่ต้องส่งของคอร์ส */
export default async function CourseAssignmentsPage(props: PageProps<"/teach/courses/[id]/assignments">) {
  const { id } = await props.params;
  const { course, assignments, pendingTotal } = await getCourseAssignments(id);
  const base = `/teach/courses/${id}/assignments`;

  return (
    <>
      <PageHeader
        title="งานที่ต้องส่ง"
        description={`${course.title} · สร้างงานแล้วผูกกับบทชนิด “งานที่ต้องส่ง” ในสารบัญ`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/review`}>
                <Inbox className="size-4" /> งานรอตรวจ{pendingTotal > 0 ? ` (${pendingTotal})` : ""}
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus className="size-4" /> สร้างงาน
              </Link>
            </Button>
          </>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="ยังไม่มีงานที่ต้องส่ง"
          description="เพิ่มบทชนิด “งานที่ต้องส่ง” ในสารบัญ แล้วสร้างงานผูกกับบทนั้น"
        />
      ) : (
        <ul className="space-y-3">
          {assignments.map((a) => (
            <li key={a.id}>
              <article aria-label={a.title} data-assignment className="bg-card border-border rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold">{a.title}</h2>
                    <p className="text-muted-foreground mt-1 text-[12.5px]">
                      {a.lesson ? `บทเรียน: ${a.lesson.title}` : "ยังไม่ผูกกับบทเรียน — ผู้เรียนยังส่งไม่ได้"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.pendingCount > 0 ? (
                      <Badge className="bg-warning-bg text-warning-fg border-0">รอตรวจ {a.pendingCount}</Badge>
                    ) : null}
                    <Badge variant="secondary">ส่งแล้ว {a.submitterCount} คน</Badge>
                  </div>
                </div>
                <p className="text-fg-2 mt-2 text-[12.5px]">
                  {a.dueAt ? `กำหนดส่ง ${formatDateTime(a.dueAt)}` : "ไม่มีกำหนดส่ง"}
                  {a.dueAt ? (a.allowLate ? " · รับงานส่งช้า" : " · ไม่รับงานส่งช้า") : ""}
                  {" · "}คะแนนเต็ม {formatScore(a.maxScore)}
                </p>
                <div className="border-line mt-3 flex flex-wrap gap-2 border-t pt-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}/${a.id}/submissions`}>
                      <Users className="size-3.5" /> งานที่ส่ง
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${base}/${a.id}`}>
                      <Pencil className="size-3.5" /> แก้ไข
                    </Link>
                  </Button>
                  {a.submissionCount === 0 ? <DeleteAssignmentButton assignmentId={a.id} title={a.title} /> : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
