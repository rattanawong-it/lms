"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAtLeast, requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { renderEmail, sendMail } from "@/lib/mail";
import { escapeHtml } from "@/lib/notify/channels/email";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { NotificationType, Role } from "@/generated/prisma/enums";
import {
  deletionDecisionSchema,
  deletionRejectSchema,
  deletionRequestSchema,
} from "@/features/privacy/schemas";
import { otherActiveSuperAdmins } from "@/features/privacy/queries";
import { anonymizeUser } from "@/features/privacy/lib/anonymize";

/**
 * M17 · FR-17.4 — ลบบัญชีตาม PDPA ต้องให้ SUPER_ADMIN อนุมัติก่อน (Q9)
 * ผู้ใช้ส่งคำขอ (ยืนยันตัวตนอีกครั้ง) → ยกเลิกเองได้จนกว่าจะอนุมัติ → ผู้ดูแลอนุมัติ (anonymize) หรือปฏิเสธพร้อมเหตุผล
 */

/** ยืนยันตัวตนผิดได้ 5 ครั้ง/15 นาที — เท่ากับโควตาเข้าสู่ระบบ (FR-01.7) */
const CONFIRM_QUOTA = { windowSec: 15 * 60, max: 5 };

async function passwordMatches(password: string): Promise<boolean> {
  try {
    await auth.api.verifyPassword({ body: { password }, headers: await headers() });
    return true;
  } catch {
    return false;
  }
}

export async function requestAccountDeletion(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = deletionRequestSchema.safeParse({
    confirm: formData.get("confirm"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { deletionRequestedAt: true, accounts: { where: { providerId: "credential" }, select: { id: true } } },
  });
  if (row.deletionRequestedAt) return { ok: false, message: "คุณส่งคำขอไว้แล้ว กำลังรอผู้ดูแลระบบพิจารณา" };

  if (user.role === Role.SUPER_ADMIN && (await otherActiveSuperAdmins(user.id)) === 0) {
    return { ok: false, message: "คุณเป็นผู้ดูแลระบบคนสุดท้าย — แต่งตั้งผู้ดูแลระบบคนอื่นก่อนจึงจะขอลบบัญชีได้" };
  }

  if (!rateLimit(`privacy-confirm:${user.id}`, CONFIRM_QUOTA).ok) {
    return { ok: false, message: "ยืนยันตัวตนไม่สำเร็จหลายครั้งเกินไป กรุณารอ 15 นาที" };
  }
  const hasPassword = row.accounts.length > 0;
  const confirmed = hasPassword
    ? await passwordMatches(parsed.data.confirm)
    : parsed.data.confirm.trim().toLowerCase() === user.email.toLowerCase();
  if (!confirmed) {
    return {
      ok: false,
      message: "ยืนยันตัวตนไม่สำเร็จ",
      fieldErrors: { confirm: hasPassword ? "รหัสผ่านไม่ถูกต้อง" : "อีเมลไม่ตรงกับบัญชีของคุณ" },
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: new Date(), deletionReason: parsed.data.reason },
  });
  await writeAudit({
    actorId: user.id,
    action: "privacy.deletion.request",
    entity: "User",
    entityId: user.id,
    after: { reason: parsed.data.reason },
  });

  const admins = await db.user.findMany({
    where: { role: Role.SUPER_ADMIN, banned: false, deletedAt: null, id: { not: user.id } },
    select: { id: true },
  });
  await notify({
    userIds: admins.map((a) => a.id),
    type: NotificationType.SYSTEM,
    title: "มีคำขอลบบัญชีใหม่",
    body: `${user.name} ขอลบบัญชีตาม PDPA — รอการอนุมัติ`,
    link: "/admin/deletion-requests",
  });

  revalidatePath("/settings/privacy");
  revalidatePath("/admin/deletion-requests");
  return { ok: true, message: "ส่งคำขอลบบัญชีแล้ว ผู้ดูแลระบบจะพิจารณาและแจ้งผลทางอีเมล" };
}

export async function cancelAccountDeletion(): Promise<ActionResult> {
  const user = await requireUser();
  // เงื่อนไขอยู่ใน where — ถ้าผู้ดูแลเพิ่งอนุมัติไป (deletedAt) จะไม่มีแถวถูกแก้
  const updated = await db.user.updateMany({
    where: { id: user.id, deletionRequestedAt: { not: null }, deletedAt: null },
    data: { deletionRequestedAt: null, deletionReason: null },
  });
  if (updated.count === 0) return { ok: false, message: "ไม่มีคำขอลบบัญชีที่รอพิจารณา" };

  await writeAudit({ actorId: user.id, action: "privacy.deletion.cancel", entity: "User", entityId: user.id });
  revalidatePath("/settings/privacy");
  revalidatePath("/admin/deletion-requests");
  return { ok: true, message: "ยกเลิกคำขอลบบัญชีแล้ว" };
}

async function pendingTarget(userId: string) {
  return db.user.findFirst({
    where: { id: userId, deletionRequestedAt: { not: null }, deletedAt: null },
    select: { id: true, name: true, email: true, role: true, deletionRequestedAt: true, deletionReason: true },
  });
}

export async function approveAccountDeletion(formData: FormData): Promise<ActionResult> {
  const admin = await requireAtLeast(Role.SUPER_ADMIN);
  const parsed = deletionDecisionSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, message: "ไม่พบคำขอ" };

  if (parsed.data.userId === admin.id) return { ok: false, message: "อนุมัติคำขอของตนเองไม่ได้ ต้องให้ผู้ดูแลระบบคนอื่นอนุมัติ" };
  const target = await pendingTarget(parsed.data.userId);
  if (!target) return { ok: false, message: "ไม่พบคำขอ หรือคำขอถูกยกเลิก/ดำเนินการไปแล้ว" };
  if (target.role === Role.SUPER_ADMIN && (await otherActiveSuperAdmins(target.id)) === 0) {
    return { ok: false, message: "ลบผู้ดูแลระบบคนสุดท้ายไม่ได้" };
  }

  // จองคำขอแบบ atomic ก่อนทำอะไร — กดซ้ำ/สองแท็บ/ผู้ดูแลสองคนพร้อมกัน ต้อง anonymize ครั้งเดียว
  // (e2e มือถือเคยกดยืนยันซ้อนจนได้ audit อนุมัติ 2 แถว) · `deletedAt` ที่ตั้งตรงนี้ยังกันผู้ใช้ยกเลิกคำขอระหว่างลบด้วย
  const claimed = await db.user.updateMany({
    where: { id: target.id, deletionRequestedAt: { not: null }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว" };

  // แจ้งผลทางอีเมลก่อน — หลัง anonymize แล้วจะไม่มีอีเมลจริงให้ส่งอีก
  // เป็นอีเมลเกี่ยวกับบัญชี (เหมือนลิงก์รีเซ็ตรหัสผ่าน) ส่งเสมอไม่ขึ้นกับการตั้งค่าแจ้งเตือน
  try {
    await sendMail({
      to: target.email,
      subject: "บัญชีของคุณถูกลบแล้ว · KRIRK LMS",
      html: renderEmail({
        heading: "ลบบัญชีตามคำขอแล้ว",
        body: `ผู้ดูแลระบบอนุมัติคำขอลบบัญชี ${escapeHtml(target.email)} แล้ว ข้อมูลที่ระบุตัวตนได้ถูกลบออกจากระบบ ส่วนผลการเรียนถูกเก็บไว้แบบไม่ระบุตัวตนเพื่อสถิติของรายวิชา`,
        ctaLabel: "ไปที่หน้าแรก",
        ctaUrl: env.NEXT_PUBLIC_APP_URL,
        footnote: "หากคุณไม่ได้เป็นผู้ขอ กรุณาติดต่อผู้ดูแลระบบของมหาวิทยาลัยโดยเร็ว",
      }),
    });
  } catch (error) {
    console.error("[privacy] ส่งอีเมลแจ้งผลการลบบัญชีไม่สำเร็จ", error);
  }

  let result: Awaited<ReturnType<typeof anonymizeUser>>;
  try {
    result = await anonymizeUser(target.id);
  } catch (error) {
    // transaction หลักยังไม่ commit (deletionRequestedAt ยังอยู่) → ปล่อยการจองคืนให้กดใหม่ได้
    // ถ้า commit แล้วแต่ขั้นท้าย (ล้าง audit/ไฟล์) ล้ม บัญชีถูก anonymize แล้ว — ไม่ถอย deletedAt
    console.error("[privacy] anonymize ไม่สำเร็จ", error);
    await db.user.updateMany({ where: { id: target.id, deletionRequestedAt: { not: null } }, data: { deletedAt: null } });
    return { ok: false, message: "ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่" };
  }

  await writeAudit({
    actorId: admin.id,
    action: "privacy.deletion.approve",
    entity: "User",
    entityId: target.id,
    before: { requestedAt: target.deletionRequestedAt!.toISOString(), reason: target.deletionReason },
    after: { anonymized: true, ...result },
  });

  revalidatePath("/admin/deletion-requests");
  revalidatePath("/admin/users");
  return { ok: true, message: "อนุมัติแล้ว — ลบข้อมูลที่ระบุตัวตนของบัญชีนี้เรียบร้อย" };
}

export async function rejectAccountDeletion(formData: FormData): Promise<ActionResult> {
  const admin = await requireAtLeast(Role.SUPER_ADMIN);
  const parsed = deletionRejectSchema.safeParse({ userId: formData.get("userId"), reason: formData.get("reason") });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const target = await pendingTarget(parsed.data.userId);
  if (!target) return { ok: false, message: "ไม่พบคำขอ หรือคำขอถูกยกเลิก/ดำเนินการไปแล้ว" };

  // เงื่อนไขอยู่ใน where — กดซ้ำหรือผู้ดูแลอีกคนเพิ่งอนุมัติไป จะไม่ปฏิเสธซ้อน/ส่งอีเมลซ้ำ
  const cleared = await db.user.updateMany({
    where: { id: target.id, deletionRequestedAt: { not: null }, deletedAt: null },
    data: { deletionRequestedAt: null, deletionReason: null },
  });
  if (cleared.count === 0) return { ok: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว" };
  await writeAudit({
    actorId: admin.id,
    action: "privacy.deletion.reject",
    entity: "User",
    entityId: target.id,
    before: { requestedAt: target.deletionRequestedAt!.toISOString(), reason: target.deletionReason },
    after: { rejectReason: parsed.data.reason },
  });
  // แจ้งทางอีเมลเสมอเหมือนตอนอนุมัติ (phase-3-plan ขั้น 7) + ในแอป
  try {
    await sendMail({
      to: target.email,
      subject: "ผลการพิจารณาคำขอลบบัญชี · KRIRK LMS",
      html: renderEmail({
        heading: "คำขอลบบัญชีไม่ได้รับการอนุมัติ",
        body: `ผู้ดูแลระบบพิจารณาคำขอลบบัญชี ${escapeHtml(target.email)} แล้ว และยังไม่อนุมัติ ด้วยเหตุผล: ${escapeHtml(parsed.data.reason)}`,
        ctaLabel: "ดูการตั้งค่าความเป็นส่วนตัว",
        ctaUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/privacy`,
        footnote: "บัญชีของคุณยังใช้งานได้ตามปกติ และส่งคำขอใหม่ได้ทุกเมื่อ",
      }),
    });
  } catch (error) {
    console.error("[privacy] ส่งอีเมลแจ้งผลการปฏิเสธไม่สำเร็จ", error);
  }
  await notify({
    userIds: [target.id],
    type: NotificationType.SYSTEM,
    title: "คำขอลบบัญชีไม่ได้รับการอนุมัติ",
    body: `เหตุผล: ${parsed.data.reason}`,
    link: "/settings/privacy",
  });

  revalidatePath("/admin/deletion-requests");
  return { ok: true, message: "ปฏิเสธคำขอแล้ว และแจ้งผู้ใช้เรียบร้อย" };
}
