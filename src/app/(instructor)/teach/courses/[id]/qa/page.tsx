import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { getTeachQaInbox } from "@/features/qa/queries";
import { parseQaParams } from "@/features/qa/schemas";
import { QaFilters } from "@/features/qa/components/qa-filters";
import { Pager } from "@/components/shared/pager";
import { ThreadList } from "@/features/qa/components/thread-list";

export async function generateMetadata(props: PageProps<"/teach/courses/[id]/qa">): Promise<Metadata> {
  const { id } = await props.params;
  const inbox = await getTeachQaInbox(id, { filter: "unanswered", lessonId: null, page: 1 });
  return { title: `ถาม-ตอบ · ${inbox.course.title}` };
}

/** M13 · FR-13.3 — กล่องคำถามของผู้สอน · เริ่มที่กระทู้ที่ยังไม่มีคำตอบ */
export default async function TeachQaPage(props: PageProps<"/teach/courses/[id]/qa">) {
  const { id } = await props.params;
  const options = parseQaParams(await props.searchParams, "unanswered");
  const inbox = await getTeachQaInbox(id, options);
  const basePath = `/teach/courses/${id}/qa`;

  return (
    <>
      <PageHeader
        title="ถาม-ตอบของคอร์ส"
        description={`${inbox.course.title} · ${inbox.total.toLocaleString("th-TH")} กระทู้ในมุมมองนี้ · เปิดกระทู้เพื่อตอบ ปักหมุด ซ่อน หรือเลือกคำตอบที่ดีที่สุด`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/learn/${id}/qa`}>
                <ExternalLink className="size-4" /> มุมมองผู้เรียน
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <QaFilters basePath={basePath} filter={options.filter} lessonId={options.lessonId} lessons={inbox.lessons} />
        <ThreadList
          courseId={id}
          threads={inbox.threads}
          emptyTitle={options.filter === "unanswered" ? "ไม่มีคำถามที่รอคำตอบ" : "ไม่มีกระทู้ในมุมมองนี้"}
          emptyDescription="เมื่อผู้เรียนตั้งคำถาม คุณจะได้รับการแจ้งเตือนที่กระดิ่ง"
        />
        <Pager
          basePath={basePath}
          params={{ filter: options.filter, ...(options.lessonId ? { lesson: options.lessonId } : {}) }}
          page={options.page}
          pageCount={inbox.pageCount}
        />
      </div>
    </>
  );
}
