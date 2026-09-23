import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProtectedViewer } from "@/components/protected-viewer/protected-viewer";
import { AttemptStatus } from "@/generated/prisma/enums";
import { QuizResult } from "@/features/quiz/components/quiz-result";
import { QuizRunner } from "@/features/quiz/components/quiz-runner";
import { getAttemptView } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "แบบทดสอบ" };

/**
 * M07 · FR-07.5 / FR-07.6 — ทำข้อสอบและดูผล (เฉพาะเจ้าของ attempt)
 * ข้อสอบอยู่ใน `<ProtectedViewer>` เหมือนเนื้อหาบทเรียน — ข้อสอบรั่วเสียหายกว่าบทเรียน
 */
export default async function QuizAttemptPage(props: PageProps<"/quiz/[attemptId]">) {
  const { attemptId } = await props.params;
  const view = await getAttemptView(attemptId);
  const backHref = view.quiz.lessonId ? `/learn/${view.quiz.courseId}/${view.quiz.lessonId}` : "/my-courses";
  const inProgress = view.attempt.status === AttemptStatus.IN_PROGRESS;

  return (
    <div className="mx-auto max-w-[820px]">
      <Link
        href={backHref as never}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> {view.quiz.courseTitle}
      </Link>
      <h1 className="mb-4 text-[22px] leading-tight font-bold tracking-[-0.018em]">{view.quiz.title}</h1>

      <ProtectedViewer
        enabled={view.protection.active}
        watermark={view.protection.watermark}
        lessonId={view.quiz.lessonId}
      >
        {inProgress ? <QuizRunner view={view} /> : <QuizResult view={view} backHref={backHref} />}
      </ProtectedViewer>
    </div>
  );
}
