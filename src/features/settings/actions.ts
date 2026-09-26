"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { renderEmail, sendMail } from "@/lib/mail";
import { multicastText } from "@/lib/line/client";
import { env, hasLine } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { AssetKind, Role } from "@/generated/prisma/enums";
import { findReadyAsset } from "@/features/uploads/service";
import { BRANDING_SETTING_KEY, SELLER_SETTING_KEY, brandingSchema, sellerSchema } from "@/features/settings/schemas";
import { getBranding, getSeller } from "@/features/settings/queries";

/** M17 · FR-17.3 — ตั้งค่าระบบ (SUPER_ADMIN เท่านั้น) */

/** ส่งทดสอบได้ไม่เกิน 5 ครั้ง/10 นาที ต่อผู้ดูแล — กันกดรัวจนผู้ให้บริการจำกัดโควตา */
const TEST_QUOTA = { windowSec: 10 * 60, max: 5 };

export async function saveBranding(formData: FormData): Promise<ActionResult> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);

  const parsed = brandingSchema.safeParse({
    name: formData.get("name"),
    logoAssetId: formData.get("logoAssetId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const before = await getBranding();
  const logoAssetId = parsed.data.logoAssetId ?? null;

  // รูปใหม่ต้องเป็นรูปที่ผู้ดูแลคนนี้เพิ่งอัปโหลดเอง (หรือเป็นโลโก้เดิมอยู่แล้ว) — ไม่ให้หยิบไฟล์ของคนอื่นมาแสดงทุกหน้า
  if (logoAssetId && logoAssetId !== before.logoAssetId) {
    const asset = await findReadyAsset(logoAssetId, AssetKind.IMAGE);
    if (!asset) return { ok: false, message: "ไม่พบรูปโลโก้ที่อัปโหลดไว้ กรุณาอัปโหลดใหม่" };
    if (asset.uploadedById !== user.id) return { ok: false, message: "ไม่มีสิทธิ์ใช้ไฟล์ภาพนี้" };
  }

  const value = { name: parsed.data.name, logoAssetId };
  await db.systemSetting.upsert({
    where: { key: BRANDING_SETTING_KEY },
    update: { value },
    create: { key: BRANDING_SETTING_KEY, value },
  });

  await writeAudit({
    actorId: user.id,
    action: "settings.branding",
    entity: "SystemSetting",
    entityId: BRANDING_SETTING_KEY,
    before,
    after: value,
  });

  // ชื่อและโลโก้อยู่บนทุกหน้า
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกชื่อระบบและโลโก้แล้ว" };
}

/** M18 · FR-18.2 — ผู้ขายบนใบเสร็จ · ใบที่ออกไปแล้วไม่เปลี่ยน (snapshot ใน Order.billing) */
export async function saveSeller(formData: FormData): Promise<ActionResult> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);
  const parsed = sellerSchema.safeParse({
    name: formData.get("name"),
    taxId: formData.get("taxId"),
    address: formData.get("address"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { ok: false, message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const before = await getSeller();
  const value = {
    name: parsed.data.name,
    taxId: parsed.data.taxId ?? null,
    address: parsed.data.address ?? null,
    phone: parsed.data.phone ?? null,
  };
  await db.systemSetting.upsert({
    where: { key: SELLER_SETTING_KEY },
    update: { value },
    create: { key: SELLER_SETTING_KEY, value },
  });
  await writeAudit({
    actorId: user.id,
    action: "settings.seller",
    entity: "SystemSetting",
    entityId: SELLER_SETTING_KEY,
    before,
    after: value,
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: "บันทึกข้อมูลผู้ขายแล้ว — มีผลกับใบเสร็จที่ออกหลังจากนี้" };
}

export async function sendTestEmail(): Promise<ActionResult> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);
  if (!rateLimit(`settings-test:${user.id}`, TEST_QUOTA).ok) {
    return { ok: false, message: "ส่งทดสอบบ่อยเกินไป กรุณารอสักครู่" };
  }

  const { name } = await getBranding();
  try {
    await sendMail({
      to: user.email,
      subject: `ทดสอบการส่งอีเมล · ${name}`,
      html: renderEmail({
        heading: "การส่งอีเมลทำงานปกติ",
        body: `อีเมลฉบับนี้ส่งจากหน้าตั้งค่าระบบ (ผู้ให้บริการ: ${env.EMAIL_PROVIDER.toUpperCase()}) เพื่อตรวจว่าระบบส่งอีเมลได้`,
        ctaLabel: "เปิดหน้าตั้งค่าระบบ",
        ctaUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/settings`,
        footnote: "ไม่ต้องดำเนินการใด ๆ กับอีเมลฉบับนี้",
      }),
    });
  } catch (error) {
    console.error("[settings] ส่งอีเมลทดสอบไม่สำเร็จ", error);
    await writeAudit({ actorId: user.id, action: "settings.test_email", entity: "SystemSetting", after: { ok: false } });
    return { ok: false, message: "ส่งอีเมลไม่สำเร็จ — ตรวจค่า SMTP_URL / RESEND_API_KEY ใน env ของเซิร์ฟเวอร์" };
  }

  await writeAudit({ actorId: user.id, action: "settings.test_email", entity: "SystemSetting", after: { ok: true } });
  return { ok: true, message: `ส่งอีเมลทดสอบไปที่ ${user.email} แล้ว` };
}

export async function sendTestLine(): Promise<ActionResult> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);
  if (!hasLine) return { ok: false, message: "ยังไม่ได้ตั้งค่า LINE ใน env ของเซิร์ฟเวอร์" };

  const link = await db.lineLink.findUnique({ where: { userId: user.id }, select: { lineUserId: true } });
  if (!link) return { ok: false, message: "บัญชีของคุณยังไม่ได้ผูก LINE — ผูกได้ที่หน้าตั้งค่าบัญชี › LINE" };

  if (!rateLimit(`settings-test:${user.id}`, TEST_QUOTA).ok) {
    return { ok: false, message: "ส่งทดสอบบ่อยเกินไป กรุณารอสักครู่" };
  }

  const { name } = await getBranding();
  const sent = await multicastText([link.lineUserId], `ทดสอบการส่งข้อความจาก ${name} — ช่องทาง LINE ทำงานปกติ`);
  await writeAudit({ actorId: user.id, action: "settings.test_line", entity: "SystemSetting", after: { ok: sent > 0 } });
  return sent > 0
    ? { ok: true, message: "ส่งข้อความทดสอบไปที่ LINE ของคุณแล้ว" }
    : { ok: false, message: "ส่งข้อความ LINE ไม่สำเร็จ — ตรวจ LINE_CHANNEL_ACCESS_TOKEN ใน env" };
}
