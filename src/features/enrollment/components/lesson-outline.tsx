import Link from "next/link";
import { BookOpen, BookOpenCheck, CircleCheck, CirclePlay, FileText, Lock, MessagesSquare, Radio } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { LearnOutline } from "@/features/enrollment/queries";
import { LessonType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * M06 · FR-06.5 — สารบัญข้างหน้าเรียน พร้อมสถานะจบและสถานะล็อก
 *
 * ขั้น 6 จะย้ายสารบัญนี้ไปอยู่ใน drawer บนจอมือถือตามแผน — ตอนนี้วางซ้อนด้านบนแทน
 */

const LESSON_ICON: Record<string, typeof BookOpen> = {
  [LessonType.VIDEO]: CirclePlay,
  [LessonType.PDF]: FileText,
  [LessonType.TEXT]: BookOpen,
  [LessonType.LIVE]: Radio,
  [LessonType.QUIZ]: FileText,
  [LessonType.ASSIGNMENT]: FileText,
};

export function LessonOutline({
  outline,
  currentLessonId,
}: {
  outline: LearnOutline;
  currentLessonId: string;
}) {
  return (
    <nav aria-label="สารบัญบทเรียน" className="bg-card border-border rounded-xl border">
      <div className="border-line border-b p-4">
        <p className="text-[14px] font-semibold">{outline.course.title}</p>
        <div className="mt-2.5 space-y-1.5">
          <div className="text-muted-foreground flex items-center justify-between text-[12px]">
            <span className="num">
              เรียนแล้ว {outline.completedLessons}/{outline.totalLessons} บทเรียน
            </span>
            <span className="num text-foreground font-medium">{outline.progressPct}%</span>
          </div>
          <Progress
            value={outline.progressPct}
            aria-label={`ความคืบหน้าของคอร์ส ${outline.progressPct} เปอร์เซ็นต์`}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4">
          {/* M09 · FR-09.4 — ผู้สอนดูคะแนนทุกคนที่สมุดคะแนน จึงแสดงลิงก์นี้เฉพาะผู้เรียน */}
          {outline.isPreviewingAsStaff ? null : (
            <Link
              href={`/learn/${outline.course.id}/grades`}
              className="text-primary inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium hover:underline"
            >
              <BookOpenCheck className="size-4" aria-hidden /> คะแนนของฉัน
            </Link>
          )}
          {/* M13 — กระดานถาม-ตอบของทั้งคอร์ส */}
          <Link
            href={`/learn/${outline.course.id}/qa`}
            className="text-primary inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          >
            <MessagesSquare className="size-4" aria-hidden /> ถาม-ตอบ
          </Link>
        </div>
      </div>

      <ol className="max-h-[520px] overflow-y-auto p-2">
        {outline.sections.map((section, index) => (
          <li key={section.id} className="mb-1.5 last:mb-0">
            <p className="text-muted-foreground px-2 py-1.5 text-[11.5px] font-semibold">
              <span className="num mr-1.5">{index + 1}.</span>
              {section.title}
            </p>

            <ul>
              {section.lessons.map((lesson) => {
                const Icon = lesson.completed
                  ? CircleCheck
                  : lesson.locked
                    ? Lock
                    : (LESSON_ICON[lesson.type] ?? BookOpen);
                const current = lesson.id === currentLessonId;

                const inner = (
                  <>
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        lesson.completed ? "text-success-fg" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                  </>
                );

                const className = cn(
                  "flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px]",
                  current
                    ? "bg-accent text-accent-foreground font-medium"
                    : lesson.locked
                      ? "text-muted-foreground cursor-not-allowed"
                      : "hover:bg-muted",
                );

                return (
                  <li key={lesson.id}>
                    {lesson.locked ? (
                      <span
                        className={className}
                        aria-disabled="true"
                        title="ต้องเรียนบทก่อนหน้าให้จบก่อน"
                      >
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={`/learn/${outline.course.id}/${lesson.id}`}
                        aria-current={current ? "page" : undefined}
                        className={className}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}
