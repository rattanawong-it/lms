import "server-only";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  userCount: number;
  courseCount: number;
  childCount: number;
};

/** FR-02.1 — รายการคณะทั้งหมดพร้อมจำนวนผู้ใช้/คอร์ส (DEPT_ADMIN ขึ้นไป) */
export async function listDepartments(): Promise<DepartmentRow[]> {
  await requireAtLeast(Role.DEPT_ADMIN);

  const rows = await db.department.findMany({
    orderBy: [{ code: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { users: true, courses: true, children: true } },
    },
  });

  return rows.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    parentId: d.parentId,
    parentName: d.parent?.name ?? null,
    userCount: d._count.users,
    courseCount: d._count.courses,
    childCount: d._count.children,
  }));
}

/** ตัวเลือกคณะสำหรับ dropdown */
export async function departmentOptions(): Promise<{ id: string; code: string; name: string }[]> {
  await requireAtLeast(Role.DEPT_ADMIN);
  return db.department.findMany({
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });
}
