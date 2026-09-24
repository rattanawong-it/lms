import "server-only";
import { forbidden } from "next/navigation";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { parseStoredCurve, type ScoreCurveData } from "@/features/gradebook/lib/curve";
import type { CurveSource } from "@/features/score-curve/schemas";
import { canEditCurveScope } from "@/features/score-curve/lib/access";

/**
 * M09 · FR-09.6/09.7 — Score Curve
 * เกณฑ์ที่คอร์สใช้ หาทีละส่วน (เกรด / ผ่าน-ไม่ผ่าน): `Course.gradeScale` → คณะเจ้าของคอร์ส (ไล่ขึ้นคณะแม่) → ทั้งระบบ
 */

/**
 * ใช้เฉพาะเมื่อแถวทั้งระบบหายไปจาก DB (migration `score_curve` ใส่ไว้ให้แล้ว) — กันหน้าสมุดคะแนนพัง
 * ไม่ใช่แหล่งค่าเกณฑ์ปกติ และไม่ถูกส่งไปหน้าเว็บในฐานะค่าตั้งต้น
 */
const EMERGENCY_CURVE: ScoreCurveData = {
  grades: [
    { label: "A", min: 80, max: 100 },
    { label: "B+", min: 75, max: 79 },
    { label: "B", min: 70, max: 74 },
    { label: "C+", min: 65, max: 69 },
    { label: "C", min: 60, max: 64 },
    { label: "D+", min: 55, max: 59 },
    { label: "D", min: 50, max: 54 },
    { label: "F", min: 0, max: 49 },
  ],
  passFail: [
    { label: "S", min: 50, max: 100 },
    { label: "U", min: 0, max: 49 },
  ],
};

/** คณะนี้และคณะแม่ทั้งหมด เรียงจากคณะนี้ขึ้นไป (กันวนด้วยเพดานความลึก) */
async function departmentChain(departmentId: string | null): Promise<string[]> {
  const chain: string[] = [];
  let id = departmentId;
  while (id && chain.length < 20 && !chain.includes(id)) {
    chain.push(id);
    const dept = await db.department.findUnique({ where: { id }, select: { parentId: true } });
    id = dept?.parentId ?? null;
  }
  return chain;
}

export type ResolvedCurve = { curve: ScoreCurveData; source: CurveSource };

/** เกณฑ์ที่ได้จากชั้นคณะ/ระบบ (ไม่รวมที่คอร์สตั้งทับ) */
export async function inheritedCurve(departmentId: string | null): Promise<ResolvedCurve> {
  const chain = await departmentChain(departmentId);
  const rows = await db.scoreCurve.findMany({
    where: { OR: [{ departmentId: null }, ...(chain.length ? [{ departmentId: { in: chain } }] : [])] },
    select: { departmentId: true, grades: true, passFail: true },
  });
  const system = rows.find((r) => r.departmentId === null);
  const curve: ScoreCurveData = {
    ...EMERGENCY_CURVE,
    ...(system ? parseStoredCurve({ grades: system.grades, passFail: system.passFail }) : {}),
  };
  let source: CurveSource = "system";
  // คณะแม่ก่อน แล้วคณะที่ใกล้กว่าทับ
  for (const id of [...chain].reverse()) {
    const row = rows.find((r) => r.departmentId === id);
    if (!row) continue;
    const parsed = parseStoredCurve({ grades: row.grades, passFail: row.passFail });
    if (parsed.grades || parsed.passFail) source = "department";
    Object.assign(curve, parsed);
  }
  return { curve, source };
}

/** เกณฑ์ที่คอร์สใช้จริง — ผู้เรียกต้องตรวจสิทธิ์ต่อคอร์สมาก่อน */
export async function resolveCourseCurve(course: {
  gradeScale: unknown;
  departmentId: string | null;
}): Promise<ResolvedCurve & { inherited: ResolvedCurve }> {
  const inherited = await inheritedCurve(course.departmentId);
  const own = parseStoredCurve(course.gradeScale);
  const custom = Boolean(own.grades || own.passFail);
  return {
    curve: { ...inherited.curve, ...own },
    source: custom ? "course" : inherited.source,
    inherited,
  };
}

/** หน้า `/admin/score-curve` */
export async function getScoreCurvePage(requested: string | undefined) {
  const user = await requireAtLeast(Role.DEPT_ADMIN);

  const departments = await db.department.findMany({
    where: user.role === Role.SUPER_ADMIN ? {} : { id: user.departmentId ?? "__none__" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const options = [
    ...(user.role === Role.SUPER_ADMIN ? [{ value: "system", label: "ทั้งระบบ" }] : []),
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];
  if (options.length === 0) forbidden(); // ผู้ดูแลคณะที่ยังไม่ได้สังกัดคณะ

  const scope = requested ?? options[0]!.value;
  if (!options.some((o) => o.value === scope) || !canEditCurveScope(user, scope)) forbidden();

  const departmentId = scope === "system" ? null : scope;
  const row = await db.scoreCurve.findFirst({
    where: { departmentId },
    select: { grades: true, passFail: true, updatedAt: true, updatedById: true },
  });
  const updatedBy = row?.updatedById
    ? await db.user.findUnique({ where: { id: row.updatedById }, select: { name: true } })
    : null;

  // ชั้นบนของคณะนี้ = คณะแม่/ระบบ (ไม่นับแถวของคณะนี้เอง) — ใช้แสดงค่าที่จะกลับไปใช้เมื่อกด "ใช้เกณฑ์ชั้นบน"
  const parentId = departmentId
    ? ((await db.department.findUnique({ where: { id: departmentId }, select: { parentId: true } }))?.parentId ?? null)
    : null;
  const inherited = departmentId ? await inheritedCurve(parentId) : null;
  const own = row ? parseStoredCurve({ grades: row.grades, passFail: row.passFail }) : {};
  const base = inherited?.curve ?? (await inheritedCurve(null)).curve;

  return {
    scope,
    scopeLabel: options.find((o) => o.value === scope)!.label,
    options,
    curve: { ...base, ...own },
    /** คณะมีเกณฑ์ของตัวเองแล้ว (ทั้งระบบถือว่ามีเสมอ) */
    custom: scope === "system" || Boolean(own.grades || own.passFail),
    inheritedSource: inherited?.source ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: updatedBy?.name ?? null,
  };
}

export type ScoreCurvePage = Awaited<ReturnType<typeof getScoreCurvePage>>;
