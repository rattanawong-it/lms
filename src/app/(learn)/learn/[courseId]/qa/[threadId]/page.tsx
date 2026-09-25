import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getQaThread } from "@/features/qa/queries";
import { ThreadDetail } from "@/features/qa/components/thread-detail";

export async function generateMetadata(props: PageProps<"/learn/[courseId]/qa/[threadId]">): Promise<Metadata> {
  const { courseId, threadId } = await props.params;
  const data = await getQaThread(courseId, threadId);
  return { title: `${data.thread.title} · ถาม-ตอบ` };
}

/**
 * M13 · FR-13.2–13.3 — กระทู้ถาม-ตอบ
 * กระทู้ของคอร์สอื่น/ที่ถูกซ่อนแสดงหน้า 404 (สถานะ HTTP เป็น 200 เพราะ loading.tsx ของหน้ารายการ — CLAUDE.md §6)
 * เป็นเนื้อหาของผู้ใช้ ไม่ใช่เนื้อหาบทเรียน จึงไม่อยู่ใน `<ProtectedViewer>`
 */
export default async function QaThreadPage(props: PageProps<"/learn/[courseId]/qa/[threadId]">) {
  const { courseId, threadId } = await props.params;
  const data = await getQaThread(courseId, threadId);

  return (
    <div className="mx-auto max-w-[860px]">
      <Link
        href={`/learn/${courseId}/qa`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> ถาม-ตอบ · {data.course.title}
      </Link>
      <ThreadDetail data={data} courseId={courseId} />
    </div>
  );
}
