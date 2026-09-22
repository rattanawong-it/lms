import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  FileText,
  Lock,
  Paperclip,
  Radio,
  ShieldAlert,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/shared/rich-text";
import { LessonCompleteButton } from "@/features/enrollment/components/lesson-actions";
import { LessonOutline } from "@/features/enrollment/components/lesson-outline";
import { getLearnLesson, getLearnOutline } from "@/features/enrollment/queries";
import { LessonType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
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
 * M06 — หน้าเรียน (โครงของขั้น 5)
 *
 * ขั้นนี้ทำเฉพาะสิ่งที่ M06 ต้องใช้: สารบัญ, การล็อกตามลำดับ, ปุ่มเรียนจบ และปุ่มบท ก่อนหน้า/ถัดไป
 * ตัวเล่นวิดีโอ, pdf.js และ `<ProtectedViewer>` (watermark + signed URL ≤ 5 นาที) อยู่ในขั้น 6
 * — ตอนนี้จึงยังไม่มีเส้นทางให้ผู้เรียนเปิดไฟล์วิดีโอ/PDF และหน้านี้บอกไว้ตรง ๆ
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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* สารบัญขึ้นก่อนบนจอเล็ก เพื่อให้เห็นว่าอยู่ตรงไหนของคอร์ส */}
      <div className="lg:order-2">
        <LessonOutline outline={outline} currentLessonId={lessonId} />
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
          <LessonBody lesson={lesson} />
        </div>

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
                  <span className="text-muted-foreground shrink-0 text-[11.5px]">
                    {file.downloadable ? "ดาวน์โหลดได้ (ขั้น 6)" : "ดูในหน้าเรียนเท่านั้น"}
                  </span>
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

          <LessonCompleteButton
            lessonId={lessonId}
            completed={entry.completed}
            disabled={outline.isPreviewingAsStaff}
            disabledReason="ผู้สอนดูได้แต่ระบบไม่บันทึกความคืบหน้า"
          />
        </div>
      </article>
    </div>
  );
}

type Lesson = Awaited<ReturnType<typeof getLearnLesson>>;

/** เนื้อหาของบทเรียนตามชนิด — ชนิดที่ต้องมีตัวเล่นสื่อยังรอขั้น 6 */
function LessonBody({ lesson }: { lesson: Lesson }) {
  if (lesson.type === LessonType.TEXT) {
    // `<RichText>` คืน null เมื่อไม่มีเนื้อหา แต่ตัว element เองยัง truthy อยู่ดี
    // จึงต้องถามจากตัวเอกสารว่าเหลือเนื้อหาไหม ก่อนตัดสินใจแสดงสถานะว่าง
    const doc = parseRichTextDoc(lesson.content);
    if (!doc) {
      return (
        <p className="text-muted-foreground bg-card border-border rounded-xl border px-4 py-6 text-center text-[13px]">
          บทเรียนนี้ยังไม่มีเนื้อหา
        </p>
      );
    }
    return <RichText content={doc} className="space-y-2" />;
  }

  if (lesson.type === LessonType.LIVE) {
    return (
      <div className="bg-card border-border space-y-2 rounded-xl border p-4 text-[13px]">
        <p className="flex items-center gap-2 font-semibold">
          <Radio className="size-4" /> คาบเรียนสด
        </p>
        {lesson.liveStartAt ? (
          <p className="text-muted-foreground num">
            เริ่ม {formatDateTime(lesson.liveStartAt)}
            {lesson.liveEndAt ? ` – ${formatDateTime(lesson.liveEndAt)}` : ""}
          </p>
        ) : null}
        {lesson.liveUrl ? (
          <Button asChild size="sm" className="mt-1">
            <a href={lesson.liveUrl} target="_blank" rel="noopener noreferrer">
              เข้าห้องเรียนสด
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  const isVideo = lesson.type === LessonType.VIDEO;

  return (
    <div className="bg-card border-border flex flex-col items-center rounded-xl border px-6 py-10 text-center">
      <span className="bg-muted text-muted-foreground mb-3 flex size-12 items-center justify-center rounded-xl">
        {isVideo ? <Video className="size-5" /> : <FileText className="size-5" />}
      </span>
      <p className="text-[14px] font-semibold">
        {isVideo ? "ตัวเล่นวิดีโอ" : "ตัวอ่านเอกสาร"}จะเปิดใช้งานในขั้นถัดไป
      </p>
      <p className="text-muted-foreground mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed">
        ไฟล์ของบทเรียนนี้ต้องเสิร์ฟผ่าน signed URL อายุไม่เกิน 5 นาที
        พร้อมลายน้ำและการป้องกันการคัดลอก (FR-15.7) ซึ่งทำใน M15 ขั้น 6
        ระหว่างนี้ยังกด “เรียนจบบทนี้” เพื่อบันทึกความคืบหน้าได้
      </p>
    </div>
  );
}
