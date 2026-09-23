import { Megaphone, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/shared/rich-text";
import { AnnouncementScope } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { SCOPE_LABEL } from "@/features/announcements/schemas";
import { announcementAnchor } from "@/features/announcements/lib/audience";

/** ข้อมูลที่การ์ดต้องใช้ — ตรงกับ `AnnouncementItem` ใน queries.ts แต่ไม่ลาก server-only มาด้วย */
export type AnnouncementCardData = {
  id: string;
  scope: AnnouncementScope;
  title: string;
  body: unknown;
  pinned: boolean;
  publishedAt: Date | string;
  author: { name: string };
  course: { id: string; title: string } | null;
  department: { id: string; name: string } | null;
};

const SCOPE_TONE: Record<AnnouncementScope, string> = {
  [AnnouncementScope.GLOBAL]: "bg-info-bg text-info-fg",
  [AnnouncementScope.DEPARTMENT]: "bg-success-bg text-success-fg",
  [AnnouncementScope.COURSE]: "bg-muted text-fg-2",
};

/** ชื่อต้นทางของประกาศ — ใช้ทั้งในการ์ดและในหน้าหลัก */
export function announcementSource(a: Pick<AnnouncementCardData, "scope" | "course" | "department">) {
  if (a.scope === AnnouncementScope.COURSE) return a.course?.title ?? SCOPE_LABEL.COURSE;
  if (a.scope === AnnouncementScope.DEPARTMENT) return a.department?.name ?? SCOPE_LABEL.DEPARTMENT;
  return SCOPE_LABEL.GLOBAL;
}

/**
 * M11 · FR-11.1 — การ์ดประกาศหนึ่งรายการ
 * `id` ของ element ใช้เป็นปลายทางของลิงก์จากการแจ้งเตือน (`/announcements#a-…`)
 */
export function AnnouncementCard({
  announcement: a,
  actions,
  collapsed = false,
}: {
  announcement: AnnouncementCardData;
  /** ปุ่มจัดการของผู้ประกาศ (แก้/ปักหมุด/ลบ) */
  actions?: React.ReactNode;
  /** แสดงเฉพาะหัวข้อ — ใช้ในรายการของผู้จัดการที่มีประกาศยาวหลายรายการ */
  collapsed?: boolean;
}) {
  const headingId = `${announcementAnchor(a.id)}-title`;

  return (
    <article
      id={announcementAnchor(a.id)}
      aria-labelledby={headingId}
      className={cn(
        "bg-card border-border scroll-mt-24 rounded-xl border p-4 sm:p-5",
        "target:ring-ring target:ring-2",
        a.pinned && "border-ring/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.pinned ? (
          <Badge className="bg-warning-bg text-warning-fg gap-1 border-0">
            <Pin className="size-3" aria-hidden /> ปักหมุด
          </Badge>
        ) : null}
        <Badge className={cn("gap-1 border-0", SCOPE_TONE[a.scope])}>
          <Megaphone className="size-3" aria-hidden /> {SCOPE_LABEL[a.scope]}
        </Badge>
        <span className="text-muted-foreground truncate text-[12px]">{announcementSource(a)}</span>
      </div>

      <h2 id={headingId} className="mt-2.5 text-[16px] leading-snug font-semibold">
        {a.title}
      </h2>
      <p className="text-muted-foreground mt-1 text-[12px]">
        {a.author.name} · <time dateTime={new Date(a.publishedAt).toISOString()}>{formatDateTime(a.publishedAt)}</time>
      </p>

      {collapsed ? null : <RichText content={a.body} className="mt-3 space-y-2" />}

      {actions ? (
        <div className="border-line mt-4 flex flex-wrap gap-2 border-t pt-3">{actions}</div>
      ) : null}
    </article>
  );
}
