import type { Metadata } from "next";
import Link from "next/link";
import { Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { AnnouncementManager } from "@/features/announcements/components/announcement-manager";
import { getCourseAnnouncements } from "@/features/announcements/queries";

export async function generateMetadata(
  props: PageProps<"/teach/courses/[id]/announcements">,
): Promise<Metadata> {
  const { id } = await props.params;
  const { course } = await getCourseAnnouncements(id);
  return { title: `ประกาศ · ${course.title}` };
}

/** M11 · FR-11.1 — ประกาศระดับคอร์ส (ผู้สอนของคอร์ส หรือผู้ดูแลคณะเจ้าของคอร์ส) */
export default async function CourseAnnouncementsPage(
  props: PageProps<"/teach/courses/[id]/announcements">,
) {
  const { id } = await props.params;
  const { course, announcements } = await getCourseAnnouncements(id);

  return (
    <>
      <PageHeader
        title="ประกาศของคอร์ส"
        description={`${course.title} · ผู้เรียนที่ยังมีสิทธิ์เรียนจะได้รับการแจ้งเตือนทันทีที่เผยแพร่`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/students`}>
                <Users className="size-4" /> ผู้เรียน
              </Link>
            </Button>
          </>
        }
      />
      <AnnouncementManager audience={{ kind: "course", courseId: id }} announcements={announcements} />
    </>
  );
}
