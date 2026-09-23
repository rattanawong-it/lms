import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatScore } from "@/lib/decimal";
import { ExportButtons, GradebookGrid } from "@/features/gradebook/components/gradebook-grid";
import { getGradebook } from "@/features/gradebook/queries";

export const metadata: Metadata = { title: "สมุดคะแนน" };

/** M09 · FR-09.3 / FR-09.5 — สมุดคะแนนของคอร์ส: แก้คะแนนในช่องได้ (บันทึก AuditLog ทุกช่อง) และส่งออก */
export default async function GradebookPage(props: PageProps<"/teach/courses/[id]/gradebook">) {
  const { id } = await props.params;
  const data = await getGradebook(id);
  const { course, items, rows, weightTotal } = data;

  return (
    <>
      <PageHeader
        title="สมุดคะแนน"
        description={`${course.title} · ${rows.length} คน · ${items.length} รายการ`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/gradebook/settings`}>
                <Settings2 className="size-4" /> รายการ น้ำหนัก และเกณฑ์เกรด
              </Link>
            </Button>
            {rows.length > 0 ? <ExportButtons courseId={id} /> : null}
          </>
        }
      />

      {items.length > 0 && weightTotal !== 100 ? (
        <p role="status" className="bg-warning-bg text-warning-fg mb-4 flex gap-2 rounded-lg px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            น้ำหนักรวม {formatScore(weightTotal)}% — ต้องเท่ากับ 100% จึงคำนวณคะแนนรวมและเกรดได้
            {course.minScore !== null ? ` · คอร์สนี้ตั้งคะแนนขั้นต่ำ ${course.minScore} ไว้ ผู้เรียนจะยังจบคอร์สไม่ได้จนกว่าน้ำหนักครบ` : ""}
          </span>
        </p>
      ) : null}

      {rows.length === 0 || items.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="size-5" />}
          title={rows.length === 0 ? "ยังไม่มีผู้เรียนในคอร์ส" : "ยังไม่มีรายการคะแนน"}
          description={
            rows.length === 0
              ? "ผู้เรียนที่ลงทะเบียนแล้วจะแสดงที่นี่"
              : "สร้างแบบทดสอบหรืองาน (เพิ่มเข้าสมุดให้อัตโนมัติ) หรือเพิ่มรายการกรอกเองในหน้าตั้งค่า"
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-[12.5px]">
            พิมพ์คะแนนแล้วกด Enter หรือออกจากช่องเพื่อบันทึก · ช่องขอบสีส้มคือคะแนนที่แก้ทับผลจากแบบทดสอบ/งาน
            (ผลใหม่จะไม่เขียนทับ กดไอคอนข้างช่องเพื่อกลับไปใช้คะแนนอัตโนมัติ)
          </p>
          <GradebookGrid data={data} />
        </>
      )}
    </>
  );
}
