import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AnnouncementManager } from "@/features/announcements/components/announcement-manager";
import { getOrgAnnouncements } from "@/features/announcements/queries";

export const metadata: Metadata = { title: "ประกาศ" };

/**
 * M11 · FR-11.1 — ประกาศทั้งมหาวิทยาลัย (Super Admin) และระดับคณะ (Dept Admin เฉพาะคณะตน)
 * ประกาศระดับคอร์สอยู่ที่ /teach/courses/[id]/announcements
 */
export default async function AdminAnnouncementsPage() {
  const { announcements, departments, canPostGlobal } = await getOrgAnnouncements();

  return (
    <>
      <PageHeader
        title="ประกาศ"
        description={
          canPostGlobal
            ? "ประกาศถึงผู้ใช้ทุกคนในมหาวิทยาลัย หรือเฉพาะคณะที่เลือก — ผู้รับจะได้รับการแจ้งเตือนที่กระดิ่ง"
            : "ประกาศถึงผู้ใช้ทุกคนในคณะของคุณ — ผู้รับจะได้รับการแจ้งเตือนที่กระดิ่ง"
        }
      />
      <AnnouncementManager
        audience={{ kind: "org", canPostGlobal, departments }}
        announcements={announcements}
      />
    </>
  );
}
