import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryManager } from "@/features/categories/components/category-manager";
import { listCategories } from "@/features/categories/queries";
import { requireRole } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "หมวดหมู่คอร์ส" };

/** M03 · FR-03.1 — จัดการหมวดหมู่คอร์ส (เฉพาะ SUPER_ADMIN ตาม §4.1) */
export default async function CategoriesPage() {
  await requireRole(Role.SUPER_ADMIN);
  const rows = await listCategories();

  return (
    <>
      <PageHeader
        title="หมวดหมู่คอร์ส"
        description="FR-03.1 · หมวดหมู่ที่สร้างไว้จะกลายเป็นตัวกรองในหน้าคลังคอร์สให้ผู้เรียนเลือกใช้"
      />
      <CategoryManager rows={rows} />
    </>
  );
}
