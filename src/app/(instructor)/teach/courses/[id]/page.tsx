import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, ClipboardCheck, ExternalLink, FileQuestion, FileText, ListTree, Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CourseForm } from "@/features/courses/components/course-form";
import { CourseSidebar } from "@/features/courses/components/course-sidebar";
import { courseFormOptions, getCourseForEdit } from "@/features/courses/queries";

export async function generateMetadata(
  props: PageProps<"/teach/courses/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const course = await getCourseForEdit(id);
  return { title: `ตั้งค่า · ${course.title}` };
}

/** M04 · FR-04.1 / FR-04.5 / FR-04.6 / FR-04.7 — ตั้งค่าคอร์ส */
export default async function CourseSettingsPage(props: PageProps<"/teach/courses/[id]">) {
  const { id } = await props.params;
  const [course, options] = await Promise.all([getCourseForEdit(id), courseFormOptions()]);

  return (
    <>
      <PageHeader
        title={course.title}
        description="ข้อมูลคอร์ส ผู้สอนร่วม เงื่อนไขการจบ และการส่งเผยแพร่"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/courses/${course.slug}`}>
                <ExternalLink className="size-4" /> ดูหน้าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/quizzes`}>
                <ClipboardCheck className="size-4" /> แบบทดสอบ
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/gradebook`}>
                <BookOpenCheck className="size-4" /> สมุดคะแนน
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/assignments`}>
                <FileText className="size-4" /> งานที่ต้องส่ง
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/questions`}>
                <FileQuestion className="size-4" /> คลังข้อสอบ
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/announcements`}>
                <Megaphone className="size-4" /> ประกาศ
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/students`}>
                <Users className="size-4" /> ผู้เรียน
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/teach/courses/${course.id}/curriculum`}>
                <ListTree className="size-4" /> จัดสารบัญ
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CourseForm course={course} options={options} canChooseDepartment={course.canManage} />
        <CourseSidebar course={course} />
      </div>
    </>
  );
}
