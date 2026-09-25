"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { Role } from "@/generated/prisma/enums";
import {
  PROTECTION_SETTING_KEY,
  systemProtectionSchema,
} from "@/features/protection/schemas";
import { isProtectionEnabledSystemWide } from "@/features/protection/queries";

/**
 * M15 · FR-15.9 — สวิตช์การป้องกันระดับระบบ
 *
 * เป็นการตั้งค่าที่กระทบผู้เรียนทุกคนทุกคอร์สพร้อมกัน จึงจำกัดไว้ที่ผู้ดูแลระบบ
 * และบันทึก AuditLog ทุกครั้งว่าใครเป็นคนปิด/เปิดและเมื่อไร
 */
export async function setSystemProtection(formData: FormData): Promise<ActionResult> {
  const user = await requireAtLeast(Role.SUPER_ADMIN);

  const parsed = systemProtectionSchema.safeParse({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const before = await isProtectionEnabledSystemWide();

  await db.systemSetting.upsert({
    where: { key: PROTECTION_SETTING_KEY },
    update: { value: { enabled: parsed.data.enabled } },
    create: { key: PROTECTION_SETTING_KEY, value: { enabled: parsed.data.enabled } },
  });

  await writeAudit({
    actorId: user.id,
    action: "protection.system",
    entity: "SystemSetting",
    entityId: PROTECTION_SETTING_KEY,
    before: { enabled: before },
    after: { enabled: parsed.data.enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/screen-events");
  revalidatePath("/learn", "layout");

  return {
    ok: true,
    message: parsed.data.enabled
      ? "เปิดการป้องกันเนื้อหาทั้งระบบแล้ว"
      : "ปิดการป้องกันเนื้อหาทั้งระบบแล้ว — ผู้เรียนจะคัดลอกเนื้อหาได้",
  };
}
