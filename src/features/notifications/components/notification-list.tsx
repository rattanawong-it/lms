"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  Megaphone,
  MessageSquare,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NotificationType } from "@/generated/prisma/enums";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  /** จัดรูปแบบมาจาก server แล้ว — กันเวลาสัมพัทธ์ของ server กับ browser ไม่ตรงกันตอน hydrate */
  when: string;
  whenIso: string;
};

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  [NotificationType.ENROLLED]: BookOpen,
  [NotificationType.ANNOUNCEMENT]: Megaphone,
  [NotificationType.GRADED]: ClipboardCheck,
  [NotificationType.DUE_SOON]: CalendarClock,
  [NotificationType.LIVE_SOON]: Video,
  [NotificationType.QA_REPLY]: MessageSquare,
  [NotificationType.CERTIFICATE]: Award,
  [NotificationType.SYSTEM]: Bell,
};

/** ลิงก์ภายในระบบเท่านั้น — ค่าใน DB มาจากโค้ดเราเอง แต่ตรวจซ้ำไม่ให้กลายเป็น open redirect */
function internalLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

/** M11 · FR-11.2 — รายการแจ้งเตือน + ทำเครื่องหมายว่าอ่านแล้ว */
export function NotificationList({
  items,
  unread,
  filter,
}: {
  items: NotificationRow[];
  unread: number;
  filter: "all" | "unread";
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  /** เปิดการแจ้งเตือน = อ่านแล้ว · รอให้บันทึกเสร็จก่อนค่อยไป ตัวเลขบนกระดิ่งจะได้ลดทันที */
  function open(row: NotificationRow, href: string) {
    startTransition(async () => {
      if (!row.read) {
        const fd = new FormData();
        fd.set("id", row.id);
        await markNotificationRead(fd);
      }
      router.push(href as Parameters<typeof router.push>[0]);
    });
  }

  function markOne(formData: FormData) {
    startTransition(async () => {
      const result = await markNotificationRead(formData);
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="กรองการแจ้งเตือน" className="bg-muted flex rounded-lg p-1">
          {(
            [
              ["all", "ทั้งหมด", "/notifications"],
              ["unread", `ยังไม่อ่าน (${unread})`, "/notifications?filter=unread"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={filter === key ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-md px-3.5 text-[13px] font-medium transition-colors",
                filter === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Button type="button" variant="outline" onClick={markAll} disabled={pending || unread === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
          อ่านทั้งหมดแล้ว
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title={filter === "unread" ? "อ่านครบทุกรายการแล้ว" : "ยังไม่มีการแจ้งเตือน"}
          description="การลงทะเบียน ประกาศจากผู้สอนและคณะ และเหตุการณ์สำคัญอื่น ๆ จะแสดงที่นี่"
        />
      ) : (
        <ul className="bg-card border-border divide-line divide-y overflow-hidden rounded-xl border">
          {items.map((row) => {
            const Icon = TYPE_ICON[row.type] ?? Bell;
            const href = internalLink(row.link);
            const content = (
              <>
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    row.read ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[17px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[13.5px] leading-snug",
                      row.read ? "text-fg-2" : "font-semibold",
                    )}
                  >
                    {row.read ? null : <span className="sr-only">ยังไม่อ่าน: </span>}
                    {row.title}
                  </span>
                  {row.body ? (
                    <span className="text-muted-foreground mt-0.5 block text-[12.5px] leading-relaxed">
                      {row.body}
                    </span>
                  ) : null}
                  <time dateTime={row.whenIso} className="text-fg-4 mt-1 block text-[11.5px]">
                    {row.when}
                  </time>
                </span>
              </>
            );

            return (
              <li
                key={row.id}
                data-notification
                data-unread={row.read ? undefined : ""}
                className={cn("flex items-start gap-2 pr-3", !row.read && "bg-accent/30")}
              >
                {href ? (
                  <a
                    href={href}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      open(row, href);
                    }}
                    className="hover:bg-muted/60 focus-visible:ring-ring flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5">{content}</div>
                )}

                {row.read ? null : (
                  <form onSubmit={submitForm(markOne)} className="shrink-0 self-center">
                    <input type="hidden" name="id" value={row.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={pending}
                      aria-label={`ทำเครื่องหมายว่าอ่านแล้ว: ${row.title}`}
                      title="ทำเครื่องหมายว่าอ่านแล้ว"
                    >
                      <CheckCheck className="size-4" />
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
