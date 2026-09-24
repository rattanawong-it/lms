import "server-only";
import { db } from "@/lib/db";
import { hasLine } from "@/lib/env";
import type { NotifyChannel } from "@/lib/notify/prefs";

/**
 * FR-11.4 — ช่องทางที่ผู้ใช้คนนี้ตั้งค่าได้ตอนนี้
 * อีเมลได้เสมอ · LINE ต้องเปิดใช้ทั้งระบบ (env) และผูกบัญชีแล้ว (M12)
 * ใช้ทั้งหน้าตั้งค่า (disable checkbox) และ action (ไม่ล้างค่าของช่องทางที่แก้ไม่ได้)
 */
export type ChannelStatus = { editable: NotifyChannel[]; line: "disabled" | "unlinked" | "linked" };

export async function channelStatus(userId: string): Promise<ChannelStatus> {
  if (!hasLine) return { editable: ["email"], line: "disabled" };
  const linked = await db.lineLink.findUnique({ where: { userId }, select: { userId: true } });
  return linked ? { editable: ["email", "line"], line: "linked" } : { editable: ["email"], line: "unlinked" };
}
