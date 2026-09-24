import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { LINK_CODE_LENGTH, LINK_CODE_PREFIX, LINK_CODE_TTL_MINUTES } from "@/features/line/schemas";

/**
 * M12 · FR-12.1/12.4 — รหัสผูกบัญชีและการผูก/ยกเลิก
 * ผู้เรียกต้องตรวจตัวตนมาก่อน (action ใช้ session · webhook ใช้ลายเซ็นของ LINE)
 */

function randomCode(): string {
  return String(randomInt(0, 10 ** LINK_CODE_LENGTH)).padStart(LINK_CODE_LENGTH, "0");
}

/** สร้างรหัสใหม่ (ยกเลิกรหัสเดิมของผู้ใช้คนนี้) · รหัสไม่ซ้ำกับรหัสที่ยังใช้ได้ของคนอื่น */
export async function issueLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  await db.verification.deleteMany({ where: { identifier: { startsWith: LINK_CODE_PREFIX }, value: userId } });
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const taken = await db.verification.count({
      where: { identifier: LINK_CODE_PREFIX + code, expiresAt: { gt: new Date() } },
    });
    if (taken > 0) continue;
    await db.verification.create({ data: { identifier: LINK_CODE_PREFIX + code, value: userId, expiresAt } });
    return { code, expiresAt };
  }
  throw new Error("สร้างรหัสเชื่อมต่อ LINE ไม่สำเร็จ");
}

/** รหัสที่ยังใช้ได้ของผู้ใช้ (แสดงซ้ำเมื่อโหลดหน้าใหม่) */
export async function activeLinkCode(userId: string): Promise<{ code: string; expiresAt: Date } | null> {
  const row = await db.verification.findFirst({
    where: { identifier: { startsWith: LINK_CODE_PREFIX }, value: userId, expiresAt: { gt: new Date() } },
    select: { identifier: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  return row ? { code: row.identifier.slice(LINK_CODE_PREFIX.length), expiresAt: row.expiresAt } : null;
}

/**
 * ใช้รหัส (ครั้งเดียว) แล้วผูก `lineUserId` กับเจ้าของรหัส
 * บัญชี LINE นี้เคยผูกกับผู้ใช้อื่น → ย้ายมาที่ผู้ใช้ใหม่ · ผู้ใช้เคยผูก LINE อื่น → แทนที่
 * คืน userId ที่ผูกสำเร็จ หรือ null เมื่อรหัสผิด/หมดอายุ/ถูกใช้ไปแล้ว
 */
export async function redeemLinkCode(code: string, lineUserId: string): Promise<string | null> {
  const userId = await db.$transaction(async (tx) => {
    const row = await tx.verification.findFirst({
      where: { identifier: LINK_CODE_PREFIX + code, expiresAt: { gt: new Date() } },
      select: { id: true, value: true },
    });
    if (!row) return null;
    // deleteMany คืนจำนวนที่ลบได้จริง — สอง request ใช้รหัสเดียวกันพร้อมกัน ได้ผลแค่ตัวแรก
    const { count } = await tx.verification.deleteMany({ where: { id: row.id } });
    if (count !== 1) return null;

    const user = await tx.user.findUnique({ where: { id: row.value }, select: { id: true, banned: true } });
    if (!user || user.banned) return null;

    await tx.lineLink.deleteMany({ where: { lineUserId, NOT: { userId: user.id } } });
    await tx.lineLink.upsert({
      where: { userId: user.id },
      create: { userId: user.id, lineUserId },
      update: { lineUserId, linkedAt: new Date() },
    });
    return user.id;
  });

  if (userId) {
    await writeAudit({ actorId: userId, action: "line.link", entity: "LineLink", entityId: userId, after: { lineUserId } });
  }
  return userId;
}

/** FR-12.4 — ยกเลิกจากเว็บ (by userId) หรือเมื่อผู้ใช้ unfollow (by lineUserId) */
export async function unlink(where: { userId: string } | { lineUserId: string }, reason: "web" | "unfollow") {
  const existing = await db.lineLink.findFirst({ where, select: { userId: true, lineUserId: true } });
  if (!existing) return false;
  await db.lineLink.deleteMany({ where: { userId: existing.userId } });
  await writeAudit({
    actorId: existing.userId,
    action: "line.unlink",
    entity: "LineLink",
    entityId: existing.userId,
    before: { lineUserId: existing.lineUserId },
    after: { reason },
  });
  return true;
}
