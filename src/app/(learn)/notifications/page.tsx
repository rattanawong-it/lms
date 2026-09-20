import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PhaseNotice } from "@/components/shared/phase-notice";

export const metadata: Metadata = { title: "การแจ้งเตือน" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="การแจ้งเตือน" description="M11 · การแจ้งเตือนในแอป" />
      <PhaseNotice
        phase="Phase 1 – MVP (in-app)"
        title="ระบบแจ้งเตือนกำลังพัฒนา"
        items={[
          "FR-11.2 ไอคอนกระดิ่ง ตัวเลขยังไม่อ่าน และหน้ารวมการแจ้งเตือน",
          "FR-11.3 แจ้งเตือนทางอีเมลสำหรับเหตุการณ์สำคัญ (Phase 3)",
          "FR-11.4 ตั้งค่าประเภท × ช่องทางการแจ้งเตือน",
        ]}
      />
    </>
  );
}
