import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ClipboardCheck, FileQuestion, Inbox, Pencil, Plus, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/dates";
import { DeleteQuizButton } from "@/features/quiz/components/delete-quiz-button";
import { getCourseQuizzes } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "แบบทดสอบ" };

/** M07 · FR-07.3 — แบบทดสอบของคอร์ส */
export default async function CourseQuizzesPage(props: PageProps<"/teach/courses/[id]/quizzes">) {
  const { id } = await props.params;
  const { course, quizzes, pendingTotal } = await getCourseQuizzes(id);

  return (
    <>
      <PageHeader
        title="แบบทดสอบ"
        description={`${course.title} · สร้างจากข้อสอบในคลัง แล้วผูกกับบทชนิด “แบบทดสอบ” ในสารบัญ`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/quizzes/review`}>
                <Inbox className="size-4" /> ตรวจอัตนัย{pendingTotal > 0 ? ` (${pendingTotal})` : ""}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/questions`}>
                <FileQuestion className="size-4" /> คลังข้อสอบ
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/teach/courses/${id}/quizzes/new`}>
                <Plus className="size-4" /> สร้างแบบทดสอบ
              </Link>
            </Button>
          </>
        }
      />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-5" />}
          title="ยังไม่มีแบบทดสอบ"
          description="เพิ่มข้อสอบในคลังก่อน แล้วสร้างแบบทดสอบจากข้อที่เลือกหรือสุ่มตามแท็ก"
        />
      ) : (
        <ul className="space-y-3">
          {quizzes.map((q) => (
            <li key={q.id}>
              <article aria-label={q.title} data-quiz className="bg-card border-border rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold">{q.title}</h2>
                    <p className="text-muted-foreground mt-1 text-[12.5px]">
                      {q.lesson ? `บทเรียน: ${q.lesson.title}` : "ยังไม่ผูกกับบทเรียน — ผู้เรียนยังเข้าทำไม่ได้"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.pendingCount > 0 ? (
                      <Badge className="bg-warning-bg text-warning-fg border-0">รอตรวจ {q.pendingCount}</Badge>
                    ) : null}
                    <Badge variant="secondary">ผู้สอบแล้ว {q.attemptCount} ครั้ง</Badge>
                  </div>
                </div>
                <p className="text-fg-2 mt-2 text-[12.5px]">
                  ข้อตายตัว {q.questionCount} ข้อ
                  {q.pool.length ? ` · สุ่ม ${q.pool.map((r) => `${r.tag} ${r.count} ข้อ`).join(", ")}` : ""}
                  {" · "}ผ่าน {q.passingPct}%{" · "}
                  {q.timeLimitMin ? `${q.timeLimitMin} นาที` : "ไม่จำกัดเวลา"}
                  {" · "}
                  {q.maxAttempts ? `ทำได้ ${q.maxAttempts} ครั้ง` : "ทำได้ไม่จำกัดครั้ง"}
                </p>
                {q.availableFrom || q.availableUntil ? (
                  <p className="text-muted-foreground mt-1 text-[12px]">
                    {q.availableFrom ? `เปิด ${formatDateTime(q.availableFrom)}` : "เปิดแล้ว"}
                    {q.availableUntil ? ` · ปิด ${formatDateTime(q.availableUntil)}` : ""}
                  </p>
                ) : null}
                <div className="border-line mt-3 flex flex-wrap gap-2 border-t pt-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teach/courses/${id}/quizzes/${q.id}/results`}>
                      <BarChart3 className="size-3.5" /> ผลสอบ
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teach/courses/${id}/quizzes/${q.id}`}>
                      <Pencil className="size-3.5" /> ตั้งค่า
                    </Link>
                  </Button>
                  {q.attemptCount === 0 ? <DeleteQuizButton quizId={q.id} title={q.title} /> : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
