import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { env, hasLine } from "@/lib/env";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { BRANDING_SETTING_KEY, DEFAULT_BRANDING, parseBranding, type Branding } from "@/features/settings/schemas";

/**
 * FR-17.3 — ชื่อระบบและโลโก้ · ทุกหน้าใช้ (รวมผู้ที่ไม่ login) จึงไม่ตรวจสิทธิ์
 * cache ต่อ request — root layout กับ metadata เรียกซ้ำได้โดย query ครั้งเดียว
 */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: BRANDING_SETTING_KEY }, select: { value: true } });
    return row ? parseBranding(row.value) : DEFAULT_BRANDING;
  } catch {
    // DB ล่มต้องไม่ทำให้หน้าเว็บทั้งหมดขึ้น error เพราะหัวเว็บ
    return DEFAULT_BRANDING;
  }
});

export type IntegrationStatus = {
  email: { provider: "smtp" | "resend"; configured: boolean; from: string };
  line: { configured: boolean; basicId: string | null; linkedUsers: number };
  /** ผู้ดูแลที่กำลังดูหน้านี้ผูก LINE แล้วหรือยัง — ปุ่มส่งทดสอบ LINE ส่งหาตัวเอง */
  selfLineLinked: boolean;
};

/** FR-17.3 — สถานะการเชื่อมต่อ (ค่า secret อยู่ใน env ไม่แสดงค่า บอกแค่ว่าตั้งไว้หรือยัง) */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);
  const [linkedUsers, selfLink] = await Promise.all([
    db.lineLink.count(),
    db.lineLink.findUnique({ where: { userId: user.id }, select: { userId: true } }),
  ]);
  return {
    email: {
      provider: env.EMAIL_PROVIDER,
      configured: env.EMAIL_PROVIDER === "resend" ? Boolean(env.RESEND_API_KEY) : Boolean(env.SMTP_URL),
      from: env.EMAIL_FROM,
    },
    line: { configured: hasLine, basicId: env.LINE_OA_BASIC_ID ?? null, linkedUsers },
    selfLineLinked: Boolean(selfLink),
  };
}

/** โลโก้ปัจจุบันสำหรับฟอร์ม (ชื่อไฟล์ + ขนาด) */
export async function getBrandingEditor() {
  await requireAtLeast(Role.SUPER_ADMIN);
  const branding = await getBranding();
  const logo = branding.logoAssetId
    ? await db.asset.findUnique({
        where: { id: branding.logoAssetId },
        select: { id: true, originalName: true, size: true },
      })
    : null;
  return { branding, logo };
}
