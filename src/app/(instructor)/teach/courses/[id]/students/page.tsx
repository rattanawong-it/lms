import type { Metadata } from "next";
import Link from "next/link";
import { ListTree, Megaphone, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { RosterManager } from "@/features/enrollment/components/roster-manager";
import { ENROLL_POLICY_LABEL } from "@/features/enrollment/lib/labels";
import { getCourseRoster } from "@/features/enrollment/queries";
import { ExportButtons } from "@/features/reports/components/export-buttons";
import type { EnrollPolicy } from "@/generated/prisma/enums";

export async function generateMetadata(
  props: PageProps<"/teach/courses/[id]/students">,
): Promise<Metadata> {
  const { id } = await props.params;
  const roster = await getCourseRoster(id);
  return { title: `ผู้เรียน · ${roster.title}` };
}

/** M06 · FR-06.1 / FR-06.2 — จัดการผู้เรียนของคอร์ส · M16 · FR-16.4 — ส่งออกความคืบหน้า */
export default async function CourseStudentsPage(
  props: PageProps<"/teach/courses/[id]/students">,
) {
  const { id } = await props.params;
  const roster = await getCourseRoster(id);

  return (
    <>
      <PageHeader
        title="ผู้เรียนในคอร์ส"
        description={`${roster.title} · นโยบายการลงทะเบียน: ${
          ENROLL_POLICY_LABEL[roster.enrollPolicy as EnrollPolicy] ?? roster.enrollPolicy
        } · ถือว่าเรียนจบเมื่อความคืบหน้าถึง ${roster.minProgress}%`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/announcements`}>
                <Megaphone className="size-4" /> ประกาศ
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/curriculum`}>
                <ListTree className="size-4" /> จัดสารบัญ
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-[12.5px]">ส่งออกความคืบหน้าของผู้เรียนทุกคนในคอร์สนี้</p>
        <ExportButtons target={{ kind: "course", courseId: id }} />
      </div>
      <RosterManager roster={roster} />
    </>
  );
}
