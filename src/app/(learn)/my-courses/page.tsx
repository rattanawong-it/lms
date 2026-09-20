import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PhaseNotice } from "@/components/shared/phase-notice";

export const metadata: Metadata = { title: "คอร์สของฉัน" };

export default function MyCoursesPage() {
  return (
    <>
      <PageHeader title="คอร์สของฉัน" description="M06 · กำลังเรียน / เรียนจบ / หมดอายุ" />
      <PhaseNotice
        phase="Phase 1 – MVP"
        title="หน้าคอร์สของฉันกำลังพัฒนา"
        items={[
          "FR-06.6 แยกคอร์สเป็น กำลังเรียน / เรียนจบ / หมดอายุ",
          "FR-06.3 แถบความคืบหน้ารายคอร์สจาก LessonProgress",
          "FR-06.4 ปุ่ม \"เรียนต่อ\" กลับไปยังบทเรียนและตำแหน่งวิดีโอล่าสุด",
        ]}
      />
    </>
  );
}
