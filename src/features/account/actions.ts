"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { isAPIError } from "better-auth/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  changePasswordSchema,
  PASSWORD_CHANGE_QUOTA,
  profileSchema,
  setPasswordSchema,
} from "@/features/auth/schemas";
import { authErrorMessage } from "@/features/auth/lib/error-messages";
import { avatarSchema } from "@/features/auth/schemas";
import { avatarUrl } from "@/features/account/lib/avatar";
import { deleteAvatarFile } from "@/features/account/lib/avatar-store";
import { findReadyAsset } from "@/features/uploads/service";
import { AVATAR_KEY_PREFIX } from "@/lib/object-key";
import { AVATAR_MAX_SIZE } from "@/lib/upload-limits";
import { AssetKind } from "@/generated/prisma/enums";

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

/**
 * ตั้ง `User.image` ผ่าน Better Auth ฝั่ง server — อัปเดต cookie cache ของ session ด้วย
 * รูปที่แถบบนจึงเปลี่ยนทันที ไม่ต้องรอ cache 5 นาทีหมดอายุ
 */
async function writeAvatar(image: string | null) {
  await auth.api.updateUser({ headers: await headers(), body: { image } });
  revalidatePath("/", "layout");
}

/** M01 · FR-01.5 — ใช้รูปที่เพิ่งอัปโหลดเป็นรูปโปรไฟล์ (system-design §5.9) */
export async function setAvatar(input: { assetId: string }): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = avatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "รหัสรูปภาพไม่ถูกต้อง" };

  // ต้องเป็นรูปของตัวเองที่อัปโหลดเป็นรูปโปรไฟล์ — ไม่ยอมให้หยิบภาพปก/รูปของคนอื่นมาใช้
  const asset = await findReadyAsset(parsed.data.assetId, AssetKind.IMAGE);
  if (
    !asset ||
    asset.uploadedById !== user.id ||
    !asset.key.startsWith(AVATAR_KEY_PREFIX) ||
    asset.size > BigInt(AVATAR_MAX_SIZE)
  ) {
    return { ok: false, message: "ไม่พบรูปที่อัปโหลด กรุณาเลือกรูปใหม่" };
  }

  const before = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { image: true } });
  const image = avatarUrl(asset.id);
  if (before.image === image) return { ok: true, message: "เปลี่ยนรูปโปรไฟล์แล้ว" };

  await writeAvatar(image);
  await deleteAvatarFile(before.image, user.id);

  await writeAudit({
    actorId: user.id,
    action: "user.avatar.update",
    entity: "User",
    entityId: user.id,
    before: { image: before.image },
    after: { image },
  });

  return { ok: true, message: "เปลี่ยนรูปโปรไฟล์แล้ว" };
}

/** M01 · FR-01.5 — ลบรูปโปรไฟล์ กลับไปแสดงตัวอักษรแรกของชื่อ */
export async function removeAvatar(): Promise<ActionResult> {
  const user = await requireUser();

  const before = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { image: true } });
  if (!before.image) return { ok: true, message: "ลบรูปโปรไฟล์แล้ว" };

  await writeAvatar(null);
  await deleteAvatarFile(before.image, user.id);

  await writeAudit({
    actorId: user.id,
    action: "user.avatar.remove",
    entity: "User",
    entityId: user.id,
    before: { image: before.image },
    after: { image: null },
  });

  return { ok: true, message: "ลบรูปโปรไฟล์แล้ว" };
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

function passwordQuotaExceeded(userId: string): ActionResult | null {
  const quota = rateLimit(`password:${userId}`, PASSWORD_CHANGE_QUOTA);
  if (quota.ok) return null;
  const minutes = Math.max(1, Math.ceil(quota.retryAfterSec / 60));
  return { ok: false, message: `ลองหลายครั้งเกินไป กรุณารออีก ${minutes} นาทีแล้วลองใหม่` };
}

/**
 * M01 · FR-01.9 — เปลี่ยนรหัสผ่าน (ต้องมีรหัสเดิม)
 * audit `user.password.change` มาจาก hook `account.update` ใน `lib/auth.ts`
 */
export async function changePassword(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    revokeOtherSessions: formData.get("revokeOtherSessions"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const limited = passwordQuotaExceeded(user.id);
  if (limited) return limited;

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.password,
        revokeOtherSessions: parsed.data.revokeOtherSessions,
      },
    });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = error.body?.code;
    if (code === "INVALID_PASSWORD") {
      const message = "รหัสผ่านปัจจุบันไม่ถูกต้อง";
      return { ok: false, message, fieldErrors: { currentPassword: message } };
    }
    if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
      return { ok: false, message: "บัญชีนี้ยังไม่มีรหัสผ่าน กรุณาโหลดหน้าใหม่แล้วตั้งรหัสผ่าน" };
    }
    return { ok: false, message: authErrorMessage({ code, message: error.message }) };
  }

  revalidatePath("/settings/password");
  revalidatePath("/settings/sessions");
  return {
    ok: true,
    message: parsed.data.revokeOtherSessions
      ? "เปลี่ยนรหัสผ่านแล้ว และออกจากระบบอุปกรณ์อื่นทั้งหมด"
      : "เปลี่ยนรหัสผ่านแล้ว",
  };
}

/** M01 · FR-01.9 — ตั้งรหัสผ่านครั้งแรกให้บัญชีที่เข้าด้วย Google อย่างเดียว */
export async function setPassword(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    revokeOtherSessions: formData.get("revokeOtherSessions"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const limited = passwordQuotaExceeded(user.id);
  if (limited) return limited;

  const requestHeaders = await headers();
  try {
    await auth.api.setPassword({ headers: requestHeaders, body: { newPassword: parsed.data.password } });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = error.body?.code;
    if (code === "PASSWORD_ALREADY_SET") {
      return { ok: false, message: "บัญชีนี้มีรหัสผ่านอยู่แล้ว กรุณาโหลดหน้าใหม่แล้วเปลี่ยนรหัสผ่าน" };
    }
    return { ok: false, message: authErrorMessage({ code, message: error.message }) };
  }

  if (parsed.data.revokeOtherSessions) {
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
  }

  // สร้างแถว Account ใหม่ — hook `account.update` ไม่ทำงาน จึงบันทึกเองที่นี่ (ไม่เก็บค่ารหัสผ่าน)
  await writeAudit({
    actorId: user.id,
    action: "user.password.set",
    entity: "User",
    entityId: user.id,
    after: { revokeOtherSessions: parsed.data.revokeOtherSessions },
  });

  revalidatePath("/settings/password");
  revalidatePath("/settings/sessions");
  return {
    ok: true,
    message: parsed.data.revokeOtherSessions
      ? "ตั้งรหัสผ่านแล้ว และออกจากระบบอุปกรณ์อื่นทั้งหมด"
      : "ตั้งรหัสผ่านแล้ว ตอนนี้เข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้ด้วย",
  };
}
