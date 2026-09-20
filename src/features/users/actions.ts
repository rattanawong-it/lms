"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { canAssignRole, requireAtLeast, ROLE_LABEL } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { Role } from "@/generated/prisma/enums";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { assignRoleSchema, banUserSchema, importRowSchema } from "@/features/users/schemas";
import { parseUserCsv, type ImportPreviewRow } from "@/features/users/lib/csv";

/** FR-02.3 — กำหนด role และคณะให้ผู้ใช้ (ตามกติกา §2) */
export async function assignRole(formData: FormData): Promise<ActionResult> {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, role: true, departmentId: true },
  });
  if (!target) return { ok: false, message: "ไม่พบผู้ใช้" };

  if (target.id === actor.id && target.role !== parsed.data.role) {
    return { ok: false, message: "เปลี่ยนบทบาทของตัวเองไม่ได้" };
  }

  if (!canAssignRole(actor, target, parsed.data.role)) {
    return {
      ok: false,
      message:
        actor.role === Role.DEPT_ADMIN
          ? "ผู้ดูแลคณะเปลี่ยนบทบาทได้เฉพาะผู้ใช้ในคณะตนเอง และสูงสุดแค่ผู้สอน"
          : "ไม่มีสิทธิ์เปลี่ยนบทบาทของผู้ใช้รายนี้",
    };
  }

  // ผู้ดูแลคณะย้ายผู้ใช้ข้ามคณะไม่ได้
  const departmentId =
    actor.role === Role.SUPER_ADMIN ? parsed.data.departmentId : target.departmentId;

  const after = await db.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role, departmentId },
    select: { role: true, departmentId: true },
  });

  await writeAudit({
    actorId: actor.id,
    action: "user.role.update",
    entity: "User",
    entityId: target.id,
    before: { role: target.role, departmentId: target.departmentId },
    after,
  });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `ตั้ง ${target.name} เป็น "${ROLE_LABEL[parsed.data.role]}" เรียบร้อย`,
  };
}

/** FR-02.4 — ระงับ / เปิดใช้งานบัญชี */
export async function setUserBanned(formData: FormData): Promise<ActionResult> {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);

  const parsed = banUserSchema.safeParse({
    userId: formData.get("userId"),
    banned: formData.get("banned"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, role: true, departmentId: true, banned: true },
  });
  if (!target) return { ok: false, message: "ไม่พบผู้ใช้" };

  if (target.id === actor.id) return { ok: false, message: "ระงับบัญชีของตัวเองไม่ได้" };

  if (actor.role === Role.DEPT_ADMIN) {
    if (target.departmentId !== actor.departmentId) {
      return { ok: false, message: "ผู้ดูแลคณะจัดการได้เฉพาะผู้ใช้ในคณะตนเอง" };
    }
    if (target.role === Role.SUPER_ADMIN || target.role === Role.DEPT_ADMIN) {
      return { ok: false, message: "ไม่มีสิทธิ์ระงับบัญชีผู้ดูแล" };
    }
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      banned: parsed.data.banned,
      banReason: parsed.data.banned ? (parsed.data.reason ?? "ระงับโดยผู้ดูแลระบบ") : null,
      banExpires: null,
    },
  });

  // ตัด session ที่ยังใช้งานอยู่ทันทีเมื่อถูกระงับ
  if (parsed.data.banned) {
    await db.session.deleteMany({ where: { userId: target.id } });
  }

  await writeAudit({
    actorId: actor.id,
    action: parsed.data.banned ? "user.ban" : "user.unban",
    entity: "User",
    entityId: target.id,
    before: { banned: target.banned },
    after: { banned: parsed.data.banned, reason: parsed.data.reason ?? null },
  });

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: parsed.data.banned
      ? `ระงับบัญชี ${target.name} แล้ว`
      : `เปิดใช้งานบัญชี ${target.name} แล้ว`,
  };
}

export type ImportPreview = {
  ok: boolean;
  message: string;
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
};

/** FR-02.5 — ตรวจไฟล์ CSV และแสดงตัวอย่างก่อนยืนยันนำเข้า */
export async function previewUserImport(formData: FormData): Promise<ImportPreview> {
  await requireAtLeast(Role.DEPT_ADMIN);

  const raw = String(formData.get("csv") ?? "");
  if (!raw.trim()) {
    return { ok: false, message: "ยังไม่ได้เลือกไฟล์ หรือไฟล์ว่าง", rows: [], validCount: 0, errorCount: 0 };
  }

  const departments = await db.department.findMany({ select: { code: true } });
  const codes = new Set(departments.map((d) => d.code));
  const parsedRows = parseUserCsv(raw);

  if (parsedRows.length === 0) {
    return {
      ok: false,
      message: "ไม่พบข้อมูลในไฟล์ — ต้องมีหัวตาราง name,email,role,department,externalId",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const seen = new Set<string>();
  const existing = await db.user.findMany({
    where: { email: { in: parsedRows.map((r) => String(r.values.email ?? "").toLowerCase()) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((u) => u.email));

  const rows: ImportPreviewRow[] = parsedRows.map((row) => {
    const parsed = importRowSchema.safeParse(row.values);
    if (!parsed.success) {
      return { ...row, status: "error", error: parsed.error.issues[0]!.message };
    }
    const data = parsed.data;
    if (seen.has(data.email)) {
      return { ...row, status: "error", error: "อีเมลซ้ำกันภายในไฟล์" };
    }
    seen.add(data.email);
    if (existingEmails.has(data.email)) {
      return { ...row, status: "skip", error: "มีบัญชีอีเมลนี้ในระบบแล้ว (จะข้ามแถวนี้)" };
    }
    if (data.departmentCode && !codes.has(data.departmentCode)) {
      return { ...row, status: "error", error: `ไม่พบรหัสคณะ "${data.departmentCode}"` };
    }
    return { ...row, status: "ok", values: data as unknown as Record<string, string> };
  });

  const validCount = rows.filter((r) => r.status === "ok").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return {
    ok: errorCount === 0 && validCount > 0,
    message:
      errorCount > 0
        ? `พบข้อผิดพลาด ${errorCount} แถว — แก้ไขไฟล์แล้วอัปโหลดใหม่`
        : `ตรวจไฟล์เรียบร้อย พร้อมนำเข้า ${validCount} รายชื่อ`,
    rows,
    validCount,
    errorCount,
  };
}

/**
 * FR-02.5 — ยืนยันนำเข้าผู้ใช้จาก CSV
 * สร้างบัญชีที่ยังไม่มีรหัสผ่าน ผู้ใช้ต้องตั้งรหัสผ่านเองผ่านหน้า "ลืมรหัสผ่าน"
 */
export async function confirmUserImport(formData: FormData): Promise<ActionResult> {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);

  const raw = String(formData.get("csv") ?? "");
  const preview = await previewUserImport(formData);
  if (!raw.trim() || preview.errorCount > 0 || preview.validCount === 0) {
    return { ok: false, message: preview.message };
  }

  const departments = await db.department.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(departments.map((d) => [d.code, d.id]));

  const toCreate = preview.rows
    .filter((r) => r.status === "ok")
    .map((r) => r.values as unknown as {
      name: string;
      email: string;
      role: Role;
      departmentCode: string | null;
      externalId?: string;
    });

  let created = 0;
  for (const row of toCreate) {
    // ผู้ดูแลคณะนำเข้าได้เฉพาะคณะตนเอง และบทบาทไม่เกินผู้สอน (§2)
    let role = row.role;
    let departmentId = row.departmentCode ? (codeToId.get(row.departmentCode) ?? null) : null;

    if (actor.role === Role.DEPT_ADMIN) {
      departmentId = actor.departmentId;
      if (role === Role.SUPER_ADMIN || role === Role.DEPT_ADMIN) role = Role.INSTRUCTOR;
    }

    const user = await db.user.create({
      data: {
        name: row.name,
        email: row.email,
        emailVerified: false,
        role,
        departmentId,
        externalId: row.externalId || null,
      },
      select: { id: true },
    });
    created += 1;

    await writeAudit({
      actorId: actor.id,
      action: "user.import.create",
      entity: "User",
      entityId: user.id,
      after: { email: row.email, role, departmentId },
    });
  }

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `นำเข้าผู้ใช้สำเร็จ ${created} รายชื่อ · ผู้ใช้ตั้งรหัสผ่านครั้งแรกผ่านเมนู "ลืมรหัสผ่าน"`,
  };
}
