import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DepartmentManager } from "@/features/departments/components/department-manager";
import { listDepartments } from "@/features/departments/queries";
import { requireRole } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "คณะ / หน่วยงาน" };

/** M02 · FR-02.1 — จัดการคณะ/หน่วยงาน (เฉพาะ SUPER_ADMIN ตาม §4.1) */
export default async function DepartmentsPage() {
  await requireRole(Role.SUPER_ADMIN);
  const rows = await listDepartments();

  return (
    <>
      <PageHeader
        title="คณะ / หน่วยงาน"
        description="FR-02.1 · จัดการโครงสร้างคณะและหน่วยงานย่อย ใช้กำหนดขอบเขตข้อมูลของผู้ดูแลคณะและคอร์ส"
      />
      <DepartmentManager rows={rows} />
    </>
  );
}
