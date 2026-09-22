import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { MyCoursesView } from "@/features/enrollment/components/my-courses-view";
import { listMyCourses } from "@/features/enrollment/queries";

export const metadata: Metadata = { title: "คอร์สของฉัน" };

/** M06 · FR-06.6 — คอร์สของฉัน แยกเป็น กำลังเรียน / เรียนจบ / หมดอายุ */
export default async function MyCoursesPage() {
  const courses = await listMyCourses();
  const total = courses.active.length + courses.completed.length + courses.expired.length;

  return (
    <>
      <PageHeader
        title="คอร์สของฉัน"
        description={
          total > 0
            ? `ลงทะเบียนไว้ทั้งหมด ${total} คอร์ส`
            : "คอร์สที่คุณลงทะเบียนไว้จะแสดงที่นี่"
        }
      />
      <MyCoursesView courses={courses} />
    </>
  );
}
