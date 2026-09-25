import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { redactSecrets } from "@/features/audit/lib/json";

/**
 * FR-17.1 — บันทึกว่าใครทำอะไรกับข้อมูลใด ค่าก่อน/หลัง เวลา และ IP
 * เรียกหลังจากการเขียนข้อมูลสำเร็จเสมอ และไม่ให้ error ของ audit ทำให้ action ล้ม
 * ฟิลด์ชื่อ password/token/secret ถูกแทนด้วย "[ซ่อน]" ก่อนบันทึกเสมอ (`redactSecrets()`)
 */
export type AuditInput = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
};

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before == null ? undefined : redactSecrets(input.before),
        after: input.after == null ? undefined : redactSecrets(input.after),
        ip: await clientIp(),
      },
    });
  } catch (error) {
    console.error("[audit] บันทึก AuditLog ไม่สำเร็จ", error);
  }
}
