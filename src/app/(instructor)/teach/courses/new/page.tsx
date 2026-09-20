import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CourseForm } from "@/features/courses/components/course-form";
import { courseFormOptions } from "@/features/courses/queries";
import { requireCourseCreator } from "@/lib/rbac";
import { isAtLeast } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "สร้างคอร์ส" };

/** M04 · FR-04.1 — สร้างคอร์สใหม่ */
export default async function NewCoursePage() {
  const user = await requireCourseCreator();
  const options = await courseFormOptions();

  return (
    <>
      <PageHeader
        title="สร้างคอร์ส"
        description="กรอกข้อมูลหลักของคอร์ส แล้วค่อยเพิ่มบทเรียนในขั้นถัดไป"
      />
      <div className="max-w-[720px]">
        <CourseForm
          options={options}
          canChooseDepartment={isAtLeast(user, Role.DEPT_ADMIN)}
        />
      </div>
    </>
  );
}
