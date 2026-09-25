import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { getQaBoard } from "@/features/qa/queries";
import { parseQaParams } from "@/features/qa/schemas";
import { QaFilters } from "@/features/qa/components/qa-filters";
import { QaPager } from "@/features/qa/components/qa-pager";
import { ThreadComposer } from "@/features/qa/components/thread-composer";
import { ThreadList } from "@/features/qa/components/thread-list";

export async function generateMetadata(props: PageProps<"/learn/[courseId]/qa">): Promise<Metadata> {
  const { courseId } = await props.params;
  const board = await getQaBoard(courseId, { filter: "all", lessonId: null, page: 1 });
  return { title: `ถาม-ตอบ · ${board.course.title}` };
}

/** M13 · FR-13.1 — กระดานถาม-ตอบของคอร์ส (ผู้เรียนที่หมดอายุอ่านได้อย่างเดียว) */
export default async function CourseQaPage(props: PageProps<"/learn/[courseId]/qa">) {
  const { courseId } = await props.params;
  const options = parseQaParams(await props.searchParams);
  const board = await getQaBoard(courseId, options);
  const basePath = `/learn/${courseId}/qa`;

  return (
    <div className="mx-auto max-w-[860px]">
      <Link
        href={`/learn/${courseId}`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> {board.course.title}
      </Link>
      <PageHeader
        title="ถาม-ตอบ"
        description={
          board.canPost
            ? "ถามผู้สอนและเพื่อนร่วมคอร์ส · คำถามใหม่แจ้งเตือนผู้สอนทันที"
            : "สิทธิ์เรียนคอร์สนี้หมดอายุแล้ว — อ่านกระทู้ได้แต่ตั้งคำถามหรือตอบไม่ได้"
        }
      />

      <div className="space-y-4">
        {board.canPost ? <ThreadComposer courseId={courseId} lessons={board.lessons} collapsible /> : null}
        <QaFilters basePath={basePath} filter={options.filter} lessonId={options.lessonId} lessons={board.lessons} />
        <ThreadList
          courseId={courseId}
          threads={board.threads}
          emptyTitle={options.filter === "all" && !options.lessonId ? "ยังไม่มีคำถาม" : "ไม่มีกระทู้ที่ตรงกับตัวกรอง"}
          emptyDescription={board.canPost ? "เริ่มถามคำถามแรกได้จากปุ่ม “ถามคำถาม”" : undefined}
        />
        <QaPager
          basePath={basePath}
          params={{ filter: options.filter, ...(options.lessonId ? { lesson: options.lessonId } : {}) }}
          page={options.page}
          pageCount={board.pageCount}
        />
      </div>
    </div>
  );
}
