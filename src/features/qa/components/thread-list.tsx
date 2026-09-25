import Link from "next/link";
import { CircleCheckBig, EyeOff, MessageCircle, MessagesSquare, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelative } from "@/lib/dates";
import type { QaThreadListItem } from "@/features/qa/queries";

/** M13 — รายการกระทู้ (หน้าถาม-ตอบของคอร์ส · กล่องคำถามของผู้สอน · ส่วนท้ายหน้าเรียน) */
export function ThreadList({
  courseId,
  threads,
  emptyTitle = "ยังไม่มีคำถาม",
  emptyDescription = "คำถามที่ผู้เรียนและผู้สอนตั้งไว้จะแสดงที่นี่",
  showLesson = true,
}: {
  courseId: string;
  threads: QaThreadListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showLesson?: boolean;
}) {
  if (threads.length === 0) {
    return <EmptyState icon={<MessagesSquare className="size-5" />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="bg-card border-border divide-line divide-y rounded-xl border">
      {threads.map((t) => (
        <li key={t.id} data-qa-thread>
          <Link
            href={`/learn/${courseId}/qa/${t.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring flex gap-3 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {t.isPinned ? (
                  <Badge variant="secondary" className="bg-info-bg text-info-fg">
                    <Pin className="size-3" aria-hidden /> ปักหมุด
                  </Badge>
                ) : null}
                {t.isResolved ? (
                  <Badge variant="secondary" className="bg-success-bg text-success-fg">
                    <CircleCheckBig className="size-3" aria-hidden /> แก้ไขแล้ว
                  </Badge>
                ) : null}
                {t.isHidden ? (
                  <Badge variant="secondary" className="bg-warning-bg text-warning-fg">
                    <EyeOff className="size-3" aria-hidden /> ถูกซ่อน
                  </Badge>
                ) : null}
                <span className="text-[14px] font-semibold">{t.title}</span>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-[12.5px] break-words">{t.excerpt}</p>
              <p className="text-muted-foreground mt-1.5 text-[12px]">
                {t.author.name}
                {t.authorIsInstructor ? " (ผู้สอน)" : ""} · {formatRelative(t.lastPostAt)}
                {showLesson && t.lesson ? ` · บทเรียน: ${t.lesson.title}` : ""}
              </p>
            </div>
            <span
              className="text-muted-foreground flex shrink-0 items-start gap-1 text-[12.5px] tabular-nums"
              aria-label={`${t.replyCount} คำตอบ${t.hasAnswer ? " มีคำตอบที่ดีที่สุดแล้ว" : ""}`}
            >
              <MessageCircle className={t.hasAnswer ? "text-success-fg size-4" : "size-4"} aria-hidden />
              {t.replyCount}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
