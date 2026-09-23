import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CertificateEditor } from "@/features/certificates/components/certificate-editor";
import { getCertificateEditor } from "@/features/certificates/queries";

export const metadata: Metadata = { title: "แม่แบบใบประกาศ" };

/** M10 · FR-10.2 — แม่แบบใบประกาศของคอร์ส */
export default async function CertificateTemplatePage(props: PageProps<"/teach/courses/[id]/certificate">) {
  const { id } = await props.params;
  const data = await getCertificateEditor(id);

  return (
    <>
      <Link
        href={`/teach/courses/${id}`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> ตั้งค่าคอร์ส
      </Link>
      <PageHeader
        title="แม่แบบใบประกาศ"
        description={`${data.course.title} · ${data.custom ? "ใช้แม่แบบของคอร์สนี้" : "ยังใช้แม่แบบตั้งต้น"} · ออกไปแล้ว ${data.issuedCount} ใบ (ใบที่ออกแล้วไม่เปลี่ยนตามแม่แบบใหม่)`}
      />
      <CertificateEditor data={data} />
    </>
  );
}
