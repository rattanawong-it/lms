import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CirclePlay,
  Clock,
  FileText,
  Radio,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/shared/rich-text";
import { RatingStars } from "@/features/catalog/components/course-card";
import { getCourseBySlug, getCourseMeta } from "@/features/catalog/queries";
import { EnrollPanel } from "@/features/enrollment/components/enroll-panel";
import { ReviewSection } from "@/features/reviews/components/review-section";
import { getEnrollmentState } from "@/features/enrollment/queries";
import { getSessionUser } from "@/lib/rbac";
import { formatDate, formatDuration } from "@/lib/dates";
import { CourseStatus, LessonType } from "@/generated/prisma/enums";

/** FR-03.5 — metadata + OpenGraph ของหน้ารายละเอียดคอร์ส */
export async function generateMetadata(
  props: PageProps<"/courses/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const course = await getCourseMeta(slug);
  if (!course) return { title: "ไม่พบคอร์ส" };

  const description = course.summary ?? "คอร์สเรียนออนไลน์ของมหาวิทยาลัยเกริก";

  return {
    title: course.title,
    description,
    openGraph: { title: course.title, description, type: "article" },
    // คอร์สภายในไม่ควรถูกจัดทำดัชนีโดย search engine (FR-03.4)
    robots: course.visibility === "INTERNAL" ? { index: false, follow: false } : undefined,
  };
}

const LESSON_ICON: Record<string, typeof BookOpen> = {
  [LessonType.VIDEO]: CirclePlay,
  [LessonType.PDF]: FileText,
  [LessonType.TEXT]: BookOpen,
  [LessonType.LIVE]: Radio,
  [LessonType.QUIZ]: FileText,
  [LessonType.ASSIGNMENT]: FileText,
};

const LESSON_TYPE_LABEL: Record<string, string> = {
  [LessonType.VIDEO]: "วิดีโอ",
  [LessonType.PDF]: "เอกสาร",
  [LessonType.TEXT]: "บทความ",
  [LessonType.LIVE]: "เรียนสด",
  [LessonType.QUIZ]: "แบบทดสอบ",
  [LessonType.ASSIGNMENT]: "งานที่ต้องส่ง",
};

/** M03 · FR-03.3 — หน้ารายละเอียดคอร์ส */
export default async function CourseDetailPage(props: PageProps<"/courses/[slug]">) {
  const { slug } = await props.params;
  const [course, viewer] = await Promise.all([getCourseBySlug(slug), getSessionUser()]);
  if (!course) notFound();

  // FR-06.1 — สถานะการลงทะเบียนของผู้ใช้คนนี้ ตัดสินว่าแผงข้างขวาแสดงปุ่มอะไร
  const enrollment = viewer ? await getEnrollmentState(course.id) : null;

  const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
  const description = <RichText content={course.description} className="space-y-1" />;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      {course.status !== CourseStatus.PUBLISHED ? (
        <p className="bg-warning-bg text-warning-fg mb-5 rounded-lg px-4 py-3 text-[13px] font-medium">
          คอร์สนี้ยังไม่เผยแพร่ (สถานะ {course.status}) คุณเห็นหน้านี้ได้เพราะเป็นผู้สอนหรือผู้ดูแลของคอร์ส
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <nav aria-label="เส้นทางนำทาง" className="text-muted-foreground mb-3 text-[12.5px]">
            <Link href="/courses" className="hover:text-foreground">
              คลังคอร์ส
            </Link>
            {course.categoryName ? <span> · {course.categoryName}</span> : null}
          </nav>

          <h1 className="text-[27px] leading-tight font-bold tracking-[-0.018em]">
            {course.title}
          </h1>

          {course.summary ? (
            <p className="text-fg-2 mt-2.5 text-[14px] leading-relaxed">{course.summary}</p>
          ) : null}

          <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-4" />
              <span className="num">{totalLessons}</span> บทเรียน
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" />
              <span className="num">{course.enrollmentCount.toLocaleString("th-TH")}</span> ผู้เรียน
            </span>
            {course.ratingAvg !== null ? (
              <span className="inline-flex items-center gap-1.5">
                <RatingStars value={course.ratingAvg} size={14} />
                <span className="num">{course.ratingAvg.toFixed(1)}</span>
                <a href="#course-reviews" className="num hover:underline">
                  ({course.ratingCount.toLocaleString("th-TH")} รีวิว)
                </a>
              </span>
            ) : null}
            {course.publishedAt ? <span>เผยแพร่ {formatDate(course.publishedAt)}</span> : null}
          </div>

          <p className="text-fg-3 mt-3 text-[13px]">
            {course.instructorNames.length > 0
              ? `ผู้สอน: ${course.instructorNames.join(", ")}`
              : "ยังไม่ระบุผู้สอน"}
            {course.departmentName ? ` · ${course.departmentName}` : ""}
          </p>

          {description ? (
            <section aria-labelledby="course-about" className="mt-8">
              <h2 id="course-about" className="mb-2 text-[17px] font-semibold">
                เกี่ยวกับคอร์สนี้
              </h2>
              {description}
            </section>
          ) : null}

          <section aria-labelledby="course-curriculum" className="mt-8">
            <h2 id="course-curriculum" className="mb-3 text-[17px] font-semibold">
              สารบัญบทเรียน
            </h2>

            {course.sections.length === 0 ? (
              <p className="text-muted-foreground bg-card border-border rounded-xl border px-4 py-6 text-center text-[13px]">
                ผู้สอนยังไม่ได้เพิ่มบทเรียนในคอร์สนี้
              </p>
            ) : (
              <ol className="space-y-3">
                {course.sections.map((section, index) => (
                  <li
                    key={section.id}
                    className="bg-card border-border overflow-hidden rounded-xl border"
                  >
                    <div className="bg-background border-line flex items-center justify-between gap-3 border-b px-4 py-3">
                      <h3 className="text-[14px] font-semibold">
                        <span className="num text-muted-foreground mr-2">{index + 1}.</span>
                        {section.title}
                      </h3>
                      <span className="text-muted-foreground num shrink-0 text-[12px]">
                        {section.lessons.length} บทเรียน
                      </span>
                    </div>

                    <ul>
                      {section.lessons.map((lesson) => {
                        const Icon = LESSON_ICON[lesson.type] ?? BookOpen;
                        const duration = formatDuration(lesson.durationSec);
                        return (
                          <li
                            key={lesson.id}
                            className="border-line flex items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0"
                          >
                            <Icon className="text-muted-foreground size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {lesson.isPreview ? (
                              <Badge
                                variant="secondary"
                                className="bg-success-bg text-success-fg shrink-0"
                              >
                                ดูตัวอย่างได้
                              </Badge>
                            ) : null}
                            <span className="text-muted-foreground shrink-0 text-[12px]">
                              {LESSON_TYPE_LABEL[lesson.type] ?? lesson.type}
                            </span>
                            {duration ? (
                              <span className="text-muted-foreground num inline-flex shrink-0 items-center gap-1 text-[12px]">
                                <Clock className="size-3.5" />
                                {duration}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <ReviewSection course={course} />
        </div>

        {/* แผงลงทะเบียน */}
        <aside className="lg:sticky lg:top-[78px] lg:self-start">
          <div className="bg-card border-border overflow-hidden rounded-xl border">
            <div className="bg-muted relative aspect-[16/9] w-full">
              {course.coverUrl ? (
                <Image
                  src={course.coverUrl}
                  alt=""
                  fill
                  sizes="320px"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="from-accent to-muted flex h-full w-full items-center justify-center bg-gradient-to-br">
                  <span className="text-accent-foreground/70 text-[32px] font-bold">
                    {course.title.slice(0, 1)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">ระดับ</dt>
                  <dd className="font-medium">{course.level ?? "ไม่ระบุ"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">การเข้าเรียน</dt>
                  <dd className="font-medium">
                    {course.sequential ? "ต้องเรียนตามลำดับ" : "เลือกเรียนบทใดก่อนก็ได้"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">การมองเห็น</dt>
                  <dd className="font-medium">
                    {course.visibility === "PUBLIC" ? "เปิดสาธารณะ" : "เฉพาะภายในสถาบัน"}
                  </dd>
                </div>
              </dl>

              {viewer ? (
                <EnrollPanel
                  courseId={course.id}
                  enrollPolicy={course.enrollPolicy}
                  state={enrollment?.kind ?? "none"}
                  enrollmentId={enrollment?.enrollmentId ?? null}
                  progressPct={enrollment?.progressPct ?? 0}
                  expiresAt={enrollment?.expiresAt ?? null}
                  canTeach={course.viewerCanTeach}
                />
              ) : (
                <>
                  <Button asChild className="w-full" size="lg">
                    <Link href={`/login?next=${encodeURIComponent(`/courses/${course.slug}`)}`}>
                      เข้าสู่ระบบเพื่อลงทะเบียน
                    </Link>
                  </Button>
                  <p className="text-muted-foreground text-center text-[11.5px]">
                    ยังไม่มีบัญชี?{" "}
                    <Link href="/register" className="text-ring font-medium hover:underline">
                      สมัครสมาชิก
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
