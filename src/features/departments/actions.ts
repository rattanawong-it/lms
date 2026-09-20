"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/enums";
import {
  departmentDeleteSchema,
  departmentSchema,
  departmentUpdateSchema,
} from "@/features/departments/schemas";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";

/** FR-02.1 — สร้างคณะ/หน่วยงาน (เฉพาะ SUPER_ADMIN ตาม §4.1) */
export async function createDepartment(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = departmentSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    parentId: formData.get("parentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const exists = await db.department.findUnique({ where: { code: parsed.data.code } });
  if (exists) {
    return {
      ok: false,
      message: "รหัสคณะนี้ถูกใช้แล้ว",
      fieldErrors: { code: "รหัสคณะนี้มีอยู่ในระบบแล้ว" },
    };
  }

  const created = await db.department.create({ data: parsed.data });

  await writeAudit({
    actorId: actor.id,
    action: "department.create",
    entity: "Department",
    entityId: created.id,
    after: { code: created.code, name: created.name, parentId: created.parentId },
  });

  revalidatePath("/admin/departments");
  return { ok: true, message: `เพิ่มคณะ "${created.name}" เรียบร้อย` };
}

/** FR-02.1 — แก้ไขคณะ/หน่วยงาน */
export async function updateDepartment(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = departmentUpdateSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
    parentId: formData.get("parentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const { id, ...data } = parsed.data;

  if (data.parentId === id) {
    return {
      ok: false,
      message: "คณะเป็นหน่วยงานแม่ของตัวเองไม่ได้",
      fieldErrors: { parentId: "เลือกหน่วยงานแม่อื่นที่ไม่ใช่ตัวเอง" },
    };
  }

  const before = await db.department.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "ไม่พบคณะที่ต้องการแก้ไข" };

  // กันวงวนในลำดับชั้น (A → B → A)
  if (data.parentId) {
    let cursor: string | null = data.parentId;
    const seen = new Set<string>([id]);
    while (cursor) {
      if (seen.has(cursor)) {
        return {
          ok: false,
          message: "โครงสร้างคณะวนกลับมาที่เดิม",
          fieldErrors: { parentId: "หน่วยงานแม่ที่เลือกอยู่ใต้คณะนี้อยู่แล้ว" },
        };
      }
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await db.department.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  const duplicate = await db.department.findUnique({ where: { code: data.code } });
  if (duplicate && duplicate.id !== id) {
    return {
      ok: false,
      message: "รหัสคณะนี้ถูกใช้แล้ว",
      fieldErrors: { code: "รหัสคณะนี้มีอยู่ในระบบแล้ว" },
    };
  }

  const after = await db.department.update({ where: { id }, data });

  await writeAudit({
    actorId: actor.id,
    action: "department.update",
    entity: "Department",
    entityId: id,
    before: { code: before.code, name: before.name, parentId: before.parentId },
    after: { code: after.code, name: after.name, parentId: after.parentId },
  });

  revalidatePath("/admin/departments");
  return { ok: true, message: "บันทึกการแก้ไขเรียบร้อย" };
}

/** FR-02.1 — ลบคณะ (ทำได้เฉพาะเมื่อไม่มีผู้ใช้ คอร์ส หรือหน่วยงานย่อยผูกอยู่) */
export async function deleteDepartment(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(Role.SUPER_ADMIN);

  const parsed = departmentDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "ไม่พบคณะที่ต้องการลบ" };

  const target = await db.department.findUnique({
    where: { id: parsed.data.id },
    include: { _count: { select: { users: true, courses: true, children: true } } },
  });
  if (!target) return { ok: false, message: "ไม่พบคณะที่ต้องการลบ" };

  const { users, courses, children } = target._count;
  if (users || courses || children) {
    const reasons = [
      users ? `ผู้ใช้ ${users} คน` : null,
      courses ? `คอร์ส ${courses} รายการ` : null,
      children ? `หน่วยงานย่อย ${children} หน่วย` : null,
    ].filter(Boolean);
    return {
      ok: false,
      message: `ลบไม่ได้ เพราะยังมี${reasons.join(" · ")}ผูกอยู่กับคณะนี้`,
    };
  }

  await db.department.delete({ where: { id: target.id } });

  await writeAudit({
    actorId: actor.id,
    action: "department.delete",
    entity: "Department",
    entityId: target.id,
    before: { code: target.code, name: target.name, parentId: target.parentId },
  });

  revalidatePath("/admin/departments");
  return { ok: true, message: `ลบคณะ "${target.name}" เรียบร้อย` };
}
