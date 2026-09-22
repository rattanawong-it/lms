import type { Metadata } from "next";
import Link from "next/link";
import { Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CurriculumEditor } from "@/features/courses/components/curriculum-editor";
import { getCourseHeader, getCurriculum } from "@/features/courses/queries";

export async function generateMetadata(
  props: PageProps<"/teach/courses/[id]/curriculum">,
): Promise<Metadata> {
  const { id } = await props.params;
  const course = await getCourseHeader(id);
  return { title: `สารบัญ · ${course.title}` };
}

/** M04 · FR-04.2–04.4 — จัดสารบัญบทเรียน */
export default async function CurriculumPage(
  props: PageProps<"/teach/courses/[id]/curriculum">,
) {
  const { id } = await props.params;
  const [course, sections] = await Promise.all([getCourseHeader(id), getCurriculum(id)]);

  return (
    <>
      <PageHeader
        title="สารบัญบทเรียน"
        description={`${course.title} · ลากปุ่มจับด้านซ้ายเพื่อเรียงลำดับ ใช้คีย์บอร์ดได้ด้วย (Tab ไปที่ปุ่มจับ แล้วกด Space)`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}/students`}>
                <Users className="size-4" /> ผู้เรียน
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${course.id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
          </>
        }
      />
      <CurriculumEditor courseId={course.id} sections={sections} />
    </>
  );
}
