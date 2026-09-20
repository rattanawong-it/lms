"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { profileSchema } from "@/features/auth/schemas";

/** M01 · FR-01.5 — แก้ไขโปรไฟล์ของตนเอง */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    externalId: formData.get("externalId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const before = await db.user.findUnique({
    where: { id: user.id },
    select: { name: true, phone: true, externalId: true },
  });

  const after = await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      externalId: parsed.data.externalId || null,
    },
    select: { name: true, phone: true, externalId: true },
  });

  await writeAudit({
    actorId: user.id,
    action: "user.profile.update",
    entity: "User",
    entityId: user.id,
    before,
    after,
  });

  revalidatePath("/settings/profile");
  return { ok: true, message: "บันทึกโปรไฟล์เรียบร้อย" };
}

/** M01 · FR-01.6 — ยกเลิก session ของอุปกรณ์เครื่องอื่น */
export async function revokeSession(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  if (!token) return { ok: false, message: "ไม่พบเซสชันที่ต้องการยกเลิก" };

  const session = await db.session.findUnique({
    where: { token },
    select: { userId: true },
  });
  if (!session || session.userId !== user.id) {
    return { ok: false, message: "ไม่พบเซสชันที่ต้องการยกเลิก" };
  }

  await auth.api.revokeSession({ headers: await headers(), body: { token } });

  await writeAudit({
    actorId: user.id,
    action: "session.revoke",
    entity: "Session",
    entityId: null,
  });

  revalidatePath("/settings/sessions");
  return { ok: true, message: "ยกเลิกการเข้าสู่ระบบของอุปกรณ์นั้นแล้ว" };
}

/** M01 · FR-01.6 — ออกจากระบบทุกอุปกรณ์ยกเว้นเครื่องนี้ */
export async function revokeOtherSessions(): Promise<ActionResult> {
  const user = await requireUser();

  await auth.api.revokeOtherSessions({ headers: await headers() });

  await writeAudit({
    actorId: user.id,
    action: "session.revoke_others",
    entity: "Session",
    entityId: null,
  });

  revalidatePath("/settings/sessions");
  return { ok: true, message: "ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว" };
}
