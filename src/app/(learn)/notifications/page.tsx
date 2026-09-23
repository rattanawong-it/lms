import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/dates";
import {
  NotificationList,
  type NotificationRow,
} from "@/features/notifications/components/notification-list";
import { getNotifications, parseNotificationFilter } from "@/features/notifications/queries";

export const metadata: Metadata = { title: "การแจ้งเตือน" };

/** M11 · FR-11.2 — หน้ารวมการแจ้งเตือน */
export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const searchParams = await props.searchParams;
  const filter = parseNotificationFilter(searchParams.filter);
  const page = Number(searchParams.page ?? 1);
  const result = await getNotifications(filter, page);

  const now = new Date();
  const rows: NotificationRow[] = result.items.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.readAt !== null,
    when: formatRelative(n.createdAt, now),
    whenIso: n.createdAt.toISOString(),
  }));

  const pageHref = (p: number) =>
    `/notifications?${new URLSearchParams({
      ...(filter === "unread" ? { filter } : {}),
      page: String(p),
    })}` as const;

  return (
    <>
      <PageHeader
        title="การแจ้งเตือน"
        description={
          result.unread > 0
            ? `มี ${result.unread.toLocaleString("th-TH")} รายการที่ยังไม่อ่าน`
            : "อ่านครบทุกรายการแล้ว"
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/announcements">ดูประกาศทั้งหมด</Link>
          </Button>
        }
      />

      <NotificationList items={rows} unread={result.unread} filter={filter} />

      {result.pageCount > 1 ? (
        <nav aria-label="เลือกหน้า" className="mt-4 flex items-center justify-center gap-2">
          {result.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page - 1)}>
                <ChevronLeft className="size-4" /> ใหม่กว่า
              </Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground text-[12.5px]">
            หน้า {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page + 1)}>
                เก่ากว่า <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
