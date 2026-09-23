"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import type { ActionResult } from "@/lib/action-result";

/**
 * M11 · FR-11.2 — ทำเครื่องหมายว่าอ่านแล้ว
 *
 * ทุกคำสั่งจำกัดด้วย `userId` ของผู้ที่ล็อกอินอยู่ใน `where` เสมอ
 * id ของการแจ้งเตือนคนอื่นที่ส่งมาจึงไม่มีผลอะไร (ไม่ต้องแยก query ตรวจความเป็นเจ้าของ)
 * ไม่บันทึก AuditLog เพราะเป็นสถานะส่วนตัวของผู้ใช้ ไม่ใช่การแก้ข้อมูลของระบบ
 */

const idSchema = z.object({ id: z.cuid("ไม่พบการแจ้งเตือน") });

export async function markNotificationRead(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "ไม่พบการแจ้งเตือน" };

  await db.notification.updateMany({
    where: { id: parsed.data.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  return { ok: true, message: "ทำเครื่องหมายว่าอ่านแล้ว" };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();

  const { count } = await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  return {
    ok: true,
    message: count > 0 ? `ทำเครื่องหมายว่าอ่านแล้ว ${count} รายการ` : "ไม่มีรายการที่ยังไม่อ่าน",
  };
}
