"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-result";
import { Role } from "@/generated/prisma/enums";
import { canEditCurveScope } from "@/features/score-curve/lib/access";
import { curveScopeSchema, scoreCurveSchema } from "@/features/score-curve/schemas";

/**
 * M09 · FR-09.6/09.7/09.9 — บันทึก Score Curve ทั้งระบบ/รายคณะ
 * ตรวจสิทธิ์ตามขอบเขตจริง (Q10: DEPT_ADMIN แก้ได้เฉพาะคณะตัวเอง) และตรวจเกณฑ์ซ้ำที่ server ทุกครั้ง
 */

function readJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function authorize(scopeValue: FormDataEntryValue | null) {
  const user = await requireAtLeast(Role.DEPT_ADMIN);
  const scope = curveScopeSchema.safeParse(scopeValue);
  if (!scope.success) return { error: "ไม่พบขอบเขตของเกณฑ์" } as const;
  if (!canEditCurveScope(user, scope.data)) return { error: "คุณไม่มีสิทธิ์แก้เกณฑ์ของขอบเขตนี้" } as const;
  const departmentId = scope.data === "system" ? null : scope.data;
  if (departmentId && !(await db.department.findUnique({ where: { id: departmentId }, select: { id: true } }))) {
    return { error: "ไม่พบคณะนี้" } as const;
  }
  return { user, departmentId } as const;
}

export async function saveScoreCurve(formData: FormData): Promise<ActionResult> {
  const auth = await authorize(formData.get("scope"));
  if ("error" in auth) return { ok: false, message: auth.error! };

  const parsed = scoreCurveSchema.safeParse(readJson(formData.get("curve")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const section = issue?.path[0] === "passFail" ? "ผ่าน/ไม่ผ่าน" : "เกรด";
    return { ok: false, message: issue ? `${section}: ${issue.message}` : "เกณฑ์ไม่ถูกต้อง" };
  }

  const before = await db.scoreCurve.findFirst({
    where: { departmentId: auth.departmentId },
    select: { id: true, grades: true, passFail: true },
  });
  const data = { grades: parsed.data.grades, passFail: parsed.data.passFail, updatedById: auth.user.id };
  // departmentId null ใช้ upsert ไม่ได้ (unique ที่เป็น null) จึงหาแถวเดิมเอง — partial unique index กันแถวซ้ำอีกชั้น
  const saved = before
    ? await db.scoreCurve.update({ where: { id: before.id }, data, select: { id: true } })
    : await db.scoreCurve.create({ data: { ...data, departmentId: auth.departmentId }, select: { id: true } });

  await writeAudit({
    actorId: auth.user.id,
    action: "scoreCurve.save",
    entity: "ScoreCurve",
    entityId: saved.id,
    before: before ? { departmentId: auth.departmentId, grades: before.grades, passFail: before.passFail } : null,
    after: { departmentId: auth.departmentId, ...parsed.data },
  });

  revalidatePath("/admin/score-curve");
  return { ok: true, message: "บันทึกเกณฑ์คะแนนแล้ว" };
}

/** คณะกลับไปใช้เกณฑ์ชั้นบน (คณะแม่/ทั้งระบบ) — เกณฑ์ทั้งระบบลบไม่ได้ */
export async function resetScoreCurve(formData: FormData): Promise<ActionResult> {
  const auth = await authorize(formData.get("scope"));
  if ("error" in auth) return { ok: false, message: auth.error! };
  if (!auth.departmentId) return { ok: false, message: "เกณฑ์ทั้งระบบต้องมีอยู่เสมอ" };

  const before = await db.scoreCurve.findUnique({
    where: { departmentId: auth.departmentId },
    select: { id: true, grades: true, passFail: true },
  });
  if (!before) return { ok: true, message: "คณะนี้ใช้เกณฑ์ชั้นบนอยู่แล้ว" };

  await db.scoreCurve.delete({ where: { id: before.id } });
  await writeAudit({
    actorId: auth.user.id,
    action: "scoreCurve.reset",
    entity: "ScoreCurve",
    entityId: before.id,
    before: { departmentId: auth.departmentId, grades: before.grades, passFail: before.passFail },
  });

  revalidatePath("/admin/score-curve");
  return { ok: true, message: "กลับไปใช้เกณฑ์ชั้นบนแล้ว" };
}
