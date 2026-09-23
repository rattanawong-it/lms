import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { GradebookSettingsPanel } from "@/features/gradebook/components/gradebook-settings";
import { getGradebookSettings } from "@/features/gradebook/queries";

export const metadata: Metadata = { title: "ตั้งค่าสมุดคะแนน" };

/** M09 · FR-09.1 / FR-09.2 — รายการคะแนน น้ำหนัก และเกณฑ์ตัดเกรดของคอร์ส */
export default async function GradebookSettingsPage(props: PageProps<"/teach/courses/[id]/gradebook/settings">) {
  const { id } = await props.params;
  const data = await getGradebookSettings(id);

  return (
    <>
      <Link
        href={`/teach/courses/${id}/gradebook`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> สมุดคะแนน
      </Link>
      <PageHeader title="รายการ น้ำหนัก และเกณฑ์เกรด" description={data.course.title} />
      <GradebookSettingsPanel data={data} />
    </>
  );
}
