import "server-only";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  courseCount: number;
  childCount: number;
};

/** FR-03.1 — รายการหมวดหมู่ทั้งหมด (เฉพาะ SUPER_ADMIN ตาม §4.1) */
export async function listCategories(): Promise<CategoryRow[]> {
  await requireRole(Role.SUPER_ADMIN);

  const rows = await db.category.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { courses: true, children: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    courseCount: c._count.courses,
    childCount: c._count.children,
  }));
}
