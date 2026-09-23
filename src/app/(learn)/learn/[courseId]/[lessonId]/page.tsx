import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Download,
  Lock,
  Paperclip,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/shared/rich-text";
import { ProtectedViewer } from "@/components/protected-viewer/protected-viewer";
import { LessonCompleteButton } from "@/features/enrollment/components/lesson-actions";
import { LessonOutline } from "@/features/enrollment/components/lesson-outline";
import { OutlineDrawer } from "@/features/enrollment/components/outline-drawer";
import { getLearnLesson, getLearnOutline } from "@/features/enrollment/queries";
import { LivePanel } from "@/features/lesson-media/components/live-panel";
import { PdfCanvasViewer } from "@/features/lesson-media/components/pdf-viewer";
import { VideoPlayer } from "@/features/lesson-media/components/video-player";
import { toEmbedUrl } from "@/features/lesson-media/lib/embed";
import { LessonType, VideoSource } from "@/generated/prisma/enums";
import { getProtectionState } from "@/features/protection/queries";
import { QuizPanel } from "@/features/quiz/components/quiz-panel";
import { AssignmentPanel } from "@/features/assignments/components/assignment-panel";
import { getLessonAssignment, type LessonAssignment } from "@/features/assignments/queries";
import { getLessonQuiz, type LessonQuiz } from "@/features/quiz/queries";
import { requireUser } from "@/lib/rbac";
import { parseRichTextDoc } from "@/lib/rich-text-doc";

export async function generateMetadata(
  props: PageProps<"/learn/[courseId]/[lessonId]">,
): Promise<Metadata> {
  const { courseId, lessonId } = await props.params;
  const [outline, lesson] = await Promise.all([
    getLearnOutline(courseId),
    getLearnLesson(courseId, lessonId),
  ]);
  return { title: `${lesson.title} · ${outline.course.title}` };
}

/**
 * M05 · M06 — หน้าเรียน
 *
 * ทุกอย่างที่เป็นเนื้อหาของบทเรียนอยู่ใน `<LessonBody>` เพื่อให้ขั้นต่อไป (M15)
 * ครอบด้วย `<ProtectedViewer>` ได้ที่จุดเดียว
 */
export default async function LessonPage(props: PageProps<"/learn/[courseId]/[lessonId]">) {
  const { courseId, lessonId } = await props.params;

  const outline = await getLearnOutline(courseId);
  const index = outline.flat.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();

  const entry = outline.flat[index]!;
  const prev = index > 0 ? outline.flat[index - 1] : null;
  const next = index + 1 < outline.flat.length ? outline.flat[index + 1] : null;

  // FR-06.5 — ล็อกฝั่ง server ไม่ใช่แค่ซ่อนลิงก์ในสารบัญ
  if (entry.locked) {
    const required = outline.flat.slice(0, index).find((l) => !l.completed);
    return (
      <div className="mx-auto max-w-[560px] py-10 text-center">
        <span className="bg-muted text-muted-foreground mx-auto mb-4 flex size-12 items-center justify-center rounded-xl">
          <Lock className="size-5" />
        </span>
        <h1 className="text-[18px] font-semibold">บทเรียนนี้ยังไม่เปิด</h1>
        <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
          คอร์ส “{outline.course.title}” กำหนดให้เรียนตามลำดับ
          คุณต้องเรียนบทก่อนหน้าให้จบก่อนจึงจะเข้าบทนี้ได้
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {required ? (
            <Button asChild>
              <Link href={`/learn/${courseId}/${required.id}`}>ไปเรียน “{required.title}”</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/my-courses">คอร์สของฉัน</Link>
          </Button>
        </div>
      </div>
    );
  }

  const lesson = await getLearnLesson(courseId, lessonId);
  const outlineNav = <LessonOutline outline={outline} currentLessonId={lessonId} />;

  // FR-15.9 — ต้องเปิดทั้งระดับระบบและระดับคอร์สจึงจะป้องกันจริง
  const viewer = await requireUser();
  const protection = await getProtectionState(viewer, outline.course.protectionEnabled);
  // M07 — บทแบบทดสอบ: การ์ดแบบทดสอบแทนเนื้อหา และนับว่าจบเมื่อสอบผ่านเท่านั้น
  const lessonQuiz = lesson.type === LessonType.QUIZ ? await getLessonQuiz(lesson.id) : null;
  // M08 — บทงานที่ต้องส่ง: คำสั่งงานอยู่ใน ProtectedViewer ส่วนฟอร์มส่งงานอยู่นอก (ต้องวาง/คัดลอกข้อความได้)
  const lessonAssignment =
    lesson.type === LessonType.ASSIGNMENT ? await getLessonAssignment(lesson.id) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="lg:order-2">
        {/* FR-05.6 — จอเล็กเก็บสารบัญไว้ใน drawer · จอ lg ขึ้นไปตรึงไว้ข้างเนื้อหา */}
        <OutlineDrawer
          completedLessons={outline.completedLessons}
          totalLessons={outline.totalLessons}
        >
          {outlineNav}
        </OutlineDrawer>
        <div className="hidden lg:sticky lg:top-[78px] lg:block">{outlineNav}</div>
      </div>

      <article className="min-w-0 lg:order-1">
        {outline.isPreviewingAsStaff ? (
          <p className="bg-warning-bg text-warning-fg mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            คุณกำลังดูในฐานะผู้สอนหรือผู้ดูแล ระบบจะไม่บันทึกความคืบหน้าของคุณ
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] leading-tight font-bold tracking-[-0.018em]">
            {lesson.title}
          </h1>
          {entry.completed ? (
            <Badge variant="secondary" className="bg-success-bg text-success-fg shrink-0">
              <CircleCheckBig className="size-3.5" /> เรียนจบแล้ว
            </Badge>
          ) : null}
        </div>

        <div className="mt-5">
          <ProtectedViewer
            enabled={protection.active}
            watermark={protection.watermark}
            lessonId={lesson.id}
            allowFullscreen={lesson.type === LessonType.VIDEO}
          >
            <LessonBody
              lesson={lesson}
              canSaveProgress={!outline.isPreviewingAsStaff}
              protectionActive={protection.active}
              quiz={lessonQuiz}
              assignment={lessonAssignment}
            />
          </ProtectedViewer>
        </div>

        {lessonAssignment ? (
          <div className="mt-5">
            <AssignmentPanel
              // เริ่มฟอร์มใหม่เมื่อมีการส่ง/ตรวจ/ส่งกลับ — ไฟล์ตั้งต้นของการส่งใหม่มาจากครั้งล่าสุด
              key={`${lessonAssignment.submissions[0]?.id ?? "none"}:${lessonAssignment.submissions[0]?.status ?? ""}`}
              data={lessonAssignment}
            />
          </div>
        ) : null}

        {lesson.attachments.length > 0 ? (
          <section aria-labelledby="lesson-files" className="mt-6">
            <h2 id="lesson-files" className="mb-2 text-[14px] font-semibold">
              ไฟล์ประกอบบทเรียน
            </h2>
            <ul className="bg-card border-border divide-line divide-y rounded-xl border">
              {lesson.attachments.map((file) => (
                <li key={file.id} className="flex items-center gap-2.5 px-4 py-3 text-[13px]">
                  <Paperclip className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{file.asset.originalName}</span>
                  {/* FR-05.7 — ดาวน์โหลดได้เฉพาะไฟล์ที่ผู้สอนอนุญาตไว้ */}
                  {file.downloadable ? (
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <a href={`/api/lesson-file/${file.id}`}>
                        <Download className="size-4" /> ดาวน์โหลด
                      </a>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-[11.5px]">
                      ผู้สอนไม่เปิดให้ดาวน์โหลด
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="border-line mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <div className="flex gap-2">
            {prev ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/learn/${courseId}/${prev.id}`}>
                  <ChevronLeft className="size-4" /> บทก่อนหน้า
                </Link>
              </Button>
            ) : null}
            {next && !next.locked ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/learn/${courseId}/${next.id}`}>
                  บทถัดไป <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>

          {lessonQuiz ? (
            <p className="text-muted-foreground text-[12.5px]">บทนี้นับว่าเรียนจบเมื่อสอบผ่านแบบทดสอบ</p>
          ) : lessonAssignment ? (
            <p className="text-muted-foreground text-[12.5px]">บทนี้นับว่าเรียนจบเมื่อส่งงาน</p>
          ) : (
            <LessonCompleteButton
              lessonId={lessonId}
              completed={entry.completed}
              disabled={outline.isPreviewingAsStaff}
              disabledReason="ผู้สอนดูได้แต่ระบบไม่บันทึกความคืบหน้า"
            />
          )}
        </div>
      </article>
    </div>
  );
}

type Lesson = Awaited<ReturnType<typeof getLearnLesson>>;

function EmptyBody({ message }: { message: string }) {
  return (
    <p className="text-muted-foreground bg-card border-border rounded-xl border px-4 py-6 text-center text-[13px]">
      {message}
    </p>
  );
}

/** เนื้อหาของบทเรียนตามชนิด — จุดเดียวที่ M15 จะเอา `<ProtectedViewer>` มาครอบในขั้นถัดไป */
function LessonBody({
  lesson,
  canSaveProgress,
  protectionActive,
  quiz,
  assignment,
}: {
  lesson: Lesson;
  canSaveProgress: boolean;
  protectionActive: boolean;
  quiz: LessonQuiz | null;
  assignment: LessonAssignment | null;
}) {
  switch (lesson.type) {
    case LessonType.TEXT: {
      // `<RichText>` คืน null เมื่อไม่มีเนื้อหา แต่ตัว element เองยัง truthy อยู่ดี
      // จึงต้องถามจากตัวเอกสารว่าเหลือเนื้อหาไหม ก่อนตัดสินใจแสดงสถานะว่าง
      const doc = parseRichTextDoc(lesson.content);
      if (!doc) return <EmptyBody message="บทเรียนนี้ยังไม่มีเนื้อหา" />;
      return <RichText content={doc} className="space-y-2" />;
    }

    case LessonType.VIDEO: {
      if (lesson.videoSource === VideoSource.UPLOAD) {
        return (
          <VideoPlayer
            lessonId={lesson.id}
            durationSec={lesson.durationSec}
            canSaveProgress={canSaveProgress}
            protectionActive={protectionActive}
          />
        );
      }

      const embed = toEmbedUrl(lesson.videoUrl);
      if (!embed) return <EmptyBody message="ลิงก์วิดีโอของบทเรียนนี้ใช้ไม่ได้" />;
      return (
        <iframe
          src={embed}
          title={lesson.title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="bg-foreground aspect-video w-full rounded-xl"
        />
      );
    }

    case LessonType.PDF:
      return (
        <PdfCanvasViewer src={`/api/lesson-media/${lesson.id}`} title={lesson.title} />
      );

    case LessonType.LIVE:
      return (
        <LivePanel
          liveUrl={lesson.liveUrl}
          liveStartAt={lesson.liveStartAt}
          liveEndAt={lesson.liveEndAt}
          recordingUrl={lesson.recordingUrl}
        />
      );

    case LessonType.QUIZ:
      if (!quiz) return <EmptyBody message="ผู้สอนยังไม่ได้ผูกแบบทดสอบกับบทนี้" />;
      return <QuizPanel lessonId={lesson.id} data={quiz} />;

    case LessonType.ASSIGNMENT:
      if (!assignment) return <EmptyBody message="ผู้สอนยังไม่ได้ผูกงานกับบทนี้" />;
      return <RichText content={assignment.assignment.instructions} className="space-y-2" />;
  }
}
