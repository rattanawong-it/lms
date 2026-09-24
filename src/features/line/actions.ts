"use server";

import { revalidatePath } from "next/cache";
import { hasLine } from "@/lib/env";
import { requireUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";
import { issueLinkCode, unlink } from "@/features/line/lib/link";

/** M12 · FR-12.1 — ขอรหัสผูกบัญชี (ขอใหม่ = รหัสเดิมใช้ไม่ได้) · จำกัด 5 ครั้งต่อ 15 นาที */
export async function requestLineLinkCode(): Promise<ActionResult> {
  const user = await requireUser();
  if (!hasLine) return { ok: false, message: "ระบบยังไม่เปิดใช้การแจ้งเตือนทาง LINE" };
  if (!rateLimit(`line-link-code:${user.id}`, { windowSec: 15 * 60, max: 5 }).ok) {
    return { ok: false, message: "ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  await issueLinkCode(user.id);
  revalidatePath("/settings/line");
  return { ok: true, message: "สร้างรหัสเชื่อมต่อแล้ว — ส่งรหัสนี้ในแชท LINE ภายใน 10 นาที" };
}

/** FR-12.4 — ยกเลิกการเชื่อมต่อจากเว็บ */
export async function unlinkLine(): Promise<ActionResult> {
  const user = await requireUser();
  const removed = await unlink({ userId: user.id }, "web");
  revalidatePath("/settings/line");
  revalidatePath("/settings/notifications");
  return removed
    ? { ok: true, message: "ยกเลิกการเชื่อมต่อ LINE แล้ว" }
    : { ok: false, message: "บัญชีนี้ยังไม่ได้เชื่อมต่อ LINE" };
}
