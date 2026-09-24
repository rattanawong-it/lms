import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatScore } from "@/lib/decimal";
import { GradingMode } from "@/generated/prisma/enums";
import { SOURCE_LABEL } from "@/features/gradebook/schemas";
import { getMyGrades } from "@/features/gradebook/queries";

export const metadata: Metadata = { title: "คะแนนของฉัน" };

/** M09 · FR-09.4 — ผู้เรียนเห็นเฉพาะคะแนนของตัวเองในคอร์ส */
export default async function MyGradesPage(props: PageProps<"/learn/[courseId]/grades">) {
  const { courseId } = await props.params;
  const data = await getMyGrades(courseId);

  return (
    <div className="mx-auto max-w-[720px]">
      <Link
        href={`/learn/${courseId}`}
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-11 items-center gap-1 text-[13px]"
      >
        <ChevronLeft className="size-4" /> {data.course.title}
      </Link>
      <PageHeader title="คะแนนของฉัน" description={data.course.title} />

      {!data.enrolled ? (
        <EmptyState
          icon={<BookOpenCheck className="size-5" />}
          title="หน้านี้สำหรับผู้เรียน"
          description="ผู้สอนและผู้ดูแลดูคะแนนของทุกคนได้ที่สมุดคะแนนของคอร์ส"
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="size-5" />}
          title="ยังไม่มีรายการคะแนน"
          description="คะแนนจากแบบทดสอบ งาน และรายการที่ผู้สอนกรอกจะแสดงที่นี่"
        />
      ) : (
        <div className="space-y-4">
          <section
            aria-label="คะแนนรวม"
            className="bg-card border-border flex flex-wrap items-center gap-4 rounded-xl border p-5"
          >
            <div className="flex-1">
              <p className="text-muted-foreground text-[12.5px]">คะแนนรวม (เต็ม 100)</p>
              <p data-my-total className="text-[28px] font-bold tabular-nums">
                {data.total === null ? "–" : formatScore(data.total)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-[12.5px]">
                {data.course.mode === GradingMode.PASS_FAIL ? "ผล (ผ่าน/ไม่ผ่าน)" : "เกรด"}
              </p>
              <p data-my-grade className="text-[28px] font-bold">
                {data.grade ?? "–"}
              </p>
            </div>
            {data.total === null ? (
              <p className="text-muted-foreground w-full text-[12.5px]">
                ผู้สอนยังกำหนดน้ำหนักคะแนนไม่ครบ จึงยังสรุปคะแนนรวมไม่ได้
              </p>
            ) : (
              <p className="text-muted-foreground w-full text-[12.5px]">
                รายการที่ยังไม่มีคะแนนนับเป็น 0 · คะแนนรวมอาจเปลี่ยนเมื่อผู้สอนตรวจงานเพิ่ม
              </p>
            )}
          </section>

          <ul className="bg-card border-border divide-line divide-y rounded-xl border">
            {data.items.map((item) => (
              <li key={item.id} data-my-grade-item className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                  <span className="text-muted-foreground text-[12px]">
                    {SOURCE_LABEL[item.source]} · น้ำหนัก {formatScore(item.weight)}%
                  </span>
                </span>
                <span className="text-[14px] tabular-nums">
                  {item.score === null ? "–" : formatScore(item.score)}
                  <span className="text-muted-foreground">/{formatScore(item.maxScore)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
