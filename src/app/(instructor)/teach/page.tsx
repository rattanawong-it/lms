import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PhaseNotice } from "@/components/shared/phase-notice";

export const metadata: Metadata = { title: "ห้องผู้สอน" };

export default function TeachPage() {
  return (
    <>
      <PageHeader title="ห้องผู้สอน" description="M04 · สร้างและจัดการคอร์สของคุณ" />
      <PhaseNotice
        phase="Phase 1 – MVP"
        title="เครื่องมือผู้สอนกำลังพัฒนา"
        items={[
          "FR-04.1 สร้าง/แก้ไขข้อมูลคอร์ส",
          "FR-04.2 จัดการ Section และ Lesson พร้อมลากเรียงลำดับ",
          "FR-04.6 ส่งคอร์สให้คณะอนุมัติเผยแพร่",
        ]}
      />
    </>
  );
}
