import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLearnOutline, getResumeLessonId } from "@/features/enrollment/queries";

export async function generateMetadata(props: PageProps<"/learn/[courseId]">): Promise<Metadata> {
  const { courseId } = await props.params;
  const outline = await getLearnOutline(courseId);
  return { title: `เรียน · ${outline.course.title}` };
}

/**
 * M06 · FR-06.4 — "เรียนต่อ"
 *
 * ทุกที่ที่ลิงก์เข้าหน้าเรียนชี้มาที่ `/learn/{courseId}` เท่านั้น แล้วให้หน้านี้
 * ตัดสินเองว่าควรไปบทไหน — ผู้เรียกไม่ต้องรู้ทั้งสารบัญและกติกาการล็อก
 */
export default async function LearnEntryPage(props: PageProps<"/learn/[courseId]">) {
  const { courseId } = await props.params;
  const lessonId = await getResumeLessonId(courseId);

  if (lessonId) redirect(`/learn/${courseId}/${lessonId}`);

  const outline = await getLearnOutline(courseId);

  return (
    <>
      <PageHeader title={outline.course.title} />
      <EmptyState
        icon={<BookOpen />}
        title="คอร์สนี้ยังไม่มีบทเรียน"
        description="ผู้สอนยังไม่ได้เพิ่มบทเรียน เมื่อเพิ่มแล้วคุณจะเริ่มเรียนได้จากหน้านี้"
        action={
          <Button asChild variant="outline">
            <Link href="/my-courses">กลับไปคอร์สของฉัน</Link>
          </Button>
        }
      />
    </>
  );
}
