import Link from "next/link";
import Image from "next/image";
import { BookOpen, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CourseCard as CourseCardData } from "@/features/catalog/queries";
import { Visibility } from "@/generated/prisma/enums";
import { formatBaht } from "@/lib/payment/money";

/** ดาวคะแนนรีวิว — ใช้ทั้งบนการ์ดและหน้ารายละเอียด */
export function RatingStars({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-[1px]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= rounded ? "fill-warning-fg text-warning-fg" : "text-border"}
        />
      ))}
    </span>
  );
}

/** ภาพปกคอร์ส — คอร์สที่ยังไม่ตั้งปกใช้แผ่นสีพร้อมอักษรแรกของชื่อแทน */
function Cover({ course }: { course: CourseCardData }) {
  if (course.coverUrl) {
    return (
      <Image
        src={course.coverUrl}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
        className="object-cover"
      />
    );
  }
  return (
    <div className="from-accent to-muted flex h-full w-full items-center justify-center bg-gradient-to-br">
      <span className="text-accent-foreground/70 text-[28px] font-bold">
        {course.title.slice(0, 1)}
      </span>
    </div>
  );
}

/** M03 · FR-03.2 — การ์ดคอร์สในคลังคอร์ส */
export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <article className="bg-card border-border hover:border-ring/60 group overflow-hidden rounded-xl border transition-colors">
      <Link href={`/courses/${course.slug}`} className="block focus-visible:outline-none">
        <div className="bg-muted relative aspect-[16/9] w-full overflow-hidden">
          <Cover course={course} />
        </div>

        <div className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {course.categoryName ? (
              <Badge variant="secondary" className="bg-accent text-accent-foreground">
                {course.categoryName}
              </Badge>
            ) : null}
            {course.level ? (
              <Badge variant="secondary" className="bg-muted text-fg-3">
                {course.level}
              </Badge>
            ) : null}
          </div>

          <h3 className="group-hover:text-ring line-clamp-2 text-[15px] font-semibold">
            {course.title}
          </h3>

          {course.summary ? (
            <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed">
              {course.summary}
            </p>
          ) : null}

          <p className="text-fg-3 mt-2.5 truncate text-[12px]">
            {course.instructorNames.length > 0
              ? `ผู้สอน: ${course.instructorNames.join(", ")}`
              : "ยังไม่ระบุผู้สอน"}
          </p>

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-3.5" />
              <span className="num">{course.lessonCount}</span> บทเรียน
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              <span className="num">{course.enrollmentCount.toLocaleString("th-TH")}</span> ผู้เรียน
            </span>
            {/* M18 — ราคา (คอร์สภายในไม่แสดงป้าย "ฟรี" เพราะไม่เคยขาย) */}
            {course.price ? (
              <span className="text-foreground num font-semibold" data-price>
                {formatBaht(course.price)}
              </span>
            ) : course.visibility === Visibility.PUBLIC ? (
              <span className="text-success-fg font-medium" data-price>
                ฟรี
              </span>
            ) : null}
            {course.ratingAvg !== null ? (
              <span className="inline-flex items-center gap-1.5">
                <RatingStars value={course.ratingAvg} />
                <span className="num">{course.ratingAvg.toFixed(1)}</span>
                <span className="sr-only">
                  คะแนนเฉลี่ย {course.ratingAvg.toFixed(1)} จาก 5
                </span>
                <span className="num">({course.ratingCount})</span>
              </span>
            ) : (
              <span>ยังไม่มีรีวิว</span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
