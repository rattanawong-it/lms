"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/enums";
import {
  categoryDeleteSchema,
  categorySchema,
  categoryUpdateSchema,
} from "@/features/categories/schemas";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";

function readForm(formData: FormData) {
  return {
    slug: formData.get("slug"),
    name: formData.get("name"),
    parentId: formData.get("parentId"),
  };
}

/** หน้าที่ได้รับผลกระทบเมื่อหมวดหมู่เปลี่ยน — คลังคอร์สใช้หมวดหมู่เป็นตัวกรอง */
function revalidateCategoryPages() {
  revalidatePath("/admin/categories");
  revalidatePath("/courses");
}

/** FR-03.1 — เพิ่มหมวดหมู่ */
export async function createCategory(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = categorySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const exists = await db.category.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) {
    return {
      ok: false,
      message: "slug นี้ถูกใช้แล้ว",
      fieldErrors: { slug: "slug นี้มีอยู่ในระบบแล้ว" },
    };
  }

  const created = await db.category.create({ data: parsed.data });

  await writeAudit({
    actorId: actor.id,
    action: "category.create",
    entity: "Category",
    entityId: created.id,
    after: { slug: created.slug, name: created.name, parentId: created.parentId },
  });

  revalidateCategoryPages();
  return { ok: true, message: `เพิ่มหมวดหมู่ "${created.name}" เรียบร้อย` };
}

/** FR-03.1 — แก้ไขหมวดหมู่ */
export async function updateCategory(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = categoryUpdateSchema.safeParse({ id: formData.get("id"), ...readForm(formData) });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const { id, ...data } = parsed.data;

  if (data.parentId === id) {
    return {
      ok: false,
      message: "หมวดหมู่เป็นหมวดแม่ของตัวเองไม่ได้",
      fieldErrors: { parentId: "เลือกหมวดแม่อื่นที่ไม่ใช่ตัวเอง" },
    };
  }

  const before = await db.category.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "ไม่พบหมวดหมู่ที่ต้องการแก้ไข" };

  // กันวงวนในลำดับชั้น (A → B → A)
  if (data.parentId) {
    let cursor: string | null = data.parentId;
    const seen = new Set<string>([id]);
    while (cursor) {
      if (seen.has(cursor)) {
        return {
          ok: false,
          message: "โครงสร้างหมวดหมู่วนกลับมาที่เดิม",
          fieldErrors: { parentId: "หมวดแม่ที่เลือกอยู่ใต้หมวดนี้อยู่แล้ว" },
        };
      }
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await db.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  const duplicate = await db.category.findUnique({ where: { slug: data.slug } });
  if (duplicate && duplicate.id !== id) {
    return {
      ok: false,
      message: "slug นี้ถูกใช้แล้ว",
      fieldErrors: { slug: "slug นี้มีอยู่ในระบบแล้ว" },
    };
  }

  const after = await db.category.update({ where: { id }, data });

  await writeAudit({
    actorId: actor.id,
    action: "category.update",
    entity: "Category",
    entityId: id,
    before: { slug: before.slug, name: before.name, parentId: before.parentId },
    after: { slug: after.slug, name: after.name, parentId: after.parentId },
  });

  revalidateCategoryPages();
  return { ok: true, message: "บันทึกการแก้ไขเรียบร้อย" };
}

/** FR-03.1 — ลบหมวดหมู่ (ทำได้เฉพาะเมื่อไม่มีคอร์สหรือหมวดย่อยผูกอยู่) */
export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = categoryDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "ไม่พบหมวดหมู่ที่ต้องการลบ" };

  const target = await db.category.findUnique({
    where: { id: parsed.data.id },
    include: { _count: { select: { courses: true, children: true } } },
  });
  if (!target) return { ok: false, message: "ไม่พบหมวดหมู่ที่ต้องการลบ" };

  const { courses, children } = target._count;
  if (courses || children) {
    const reasons = [
      courses ? `คอร์ส ${courses} รายการ` : null,
      children ? `หมวดย่อย ${children} หมวด` : null,
    ].filter(Boolean);
    return { ok: false, message: `ลบไม่ได้ เพราะยังมี${reasons.join(" · ")}ผูกอยู่กับหมวดนี้` };
  }

  await db.category.delete({ where: { id: target.id } });

  await writeAudit({
    actorId: actor.id,
    action: "category.delete",
    entity: "Category",
    entityId: target.id,
    before: { slug: target.slug, name: target.name, parentId: target.parentId },
  });

  revalidateCategoryPages();
  return { ok: true, message: `ลบหมวดหมู่ "${target.name}" เรียบร้อย` };
}
