import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AnnouncementCard } from "@/features/announcements/components/announcement-card";
import { getMyAnnouncements } from "@/features/announcements/queries";

export const metadata: Metadata = { title: "ประกาศ" };

/**
 * M11 · FR-11.1 — ประกาศที่ผู้ใช้คนนี้ควรเห็น: ทั้งมหาวิทยาลัย, คณะของตน
 * และคอร์สที่เรียนอยู่หรือสอนอยู่ · ปักหมุดขึ้นก่อน
 * การแจ้งเตือนลิงก์มาที่ `#a-<id>` ของแต่ละประกาศ (CHANGELOG #18)
 */
export default async function AnnouncementsPage() {
  const announcements = await getMyAnnouncements();

  return (
    <>
      <PageHeader
        title="ประกาศ"
        description="ประกาศจากมหาวิทยาลัย คณะของคุณ และคอร์สที่คุณเรียนหรือสอนอยู่"
      />

      {announcements.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="ยังไม่มีประกาศ"
          description="เมื่อมหาวิทยาลัย คณะ หรือผู้สอนเผยแพร่ประกาศ คุณจะได้รับการแจ้งเตือนที่กระดิ่งและอ่านได้ที่นี่"
        />
      ) : (
        <div className="mx-auto max-w-[820px] space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      )}
    </>
  );
}
