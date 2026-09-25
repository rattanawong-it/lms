import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getLessonQa } from "@/features/qa/queries";
import { ThreadComposer } from "@/features/qa/components/thread-composer";
import { ThreadList } from "@/features/qa/components/thread-list";

/**
 * M13 — ส่วน "ถาม-ตอบในบทนี้" ท้ายหน้าเรียน
 * วางนอก `<ProtectedViewer>` (เป็นเนื้อหาของผู้ใช้ ต้องพิมพ์/คัดลอกได้)
 */
export async function LessonQa({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const qa = await getLessonQa(courseId, lessonId);
  const allHref = `/learn/${courseId}/qa?filter=all&lesson=${lessonId}`;

  return (
    <section aria-labelledby="lesson-qa" className="mt-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lesson-qa" className="flex items-center gap-2 text-[15px] font-semibold">
          <MessagesSquare className="text-primary size-[18px]" aria-hidden /> ถาม-ตอบในบทนี้
          <span className="text-muted-foreground text-[13px] font-normal">({qa.total})</span>
        </h2>
        {qa.total > qa.threads.length ? (
          <Link href={allHref} className="text-primary inline-flex min-h-11 items-center text-[13px] font-medium hover:underline">
            ดูทั้งหมด
          </Link>
        ) : null}
      </div>
      {qa.canPost ? (
        <ThreadComposer courseId={courseId} lessonId={lessonId} openAfterCreate={false} collapsible />
      ) : null}
      <ThreadList
        courseId={courseId}
        threads={qa.threads}
        showLesson={false}
        emptyTitle="ยังไม่มีคำถามในบทนี้"
        emptyDescription="สงสัยตรงไหนในบทเรียนนี้ ถามผู้สอนได้เลย"
      />
    </section>
  );
}
