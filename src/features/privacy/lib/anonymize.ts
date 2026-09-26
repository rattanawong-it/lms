import "server-only";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { Prisma } from "@/generated/prisma/client";
import { SCRUBBED, scrubStrings } from "@/features/audit/lib/json";
import { DELETED_USER_NAME, deletedEmail } from "@/features/privacy/schemas";

/**
 * FR-17.4 — anonymize บัญชีหลัง SUPER_ADMIN อนุมัติคำขอลบ (system-design §3.3 · ไม่ลบแถว User)
 *
 * | ข้อมูล | ทำอะไร | เหตุผล |
 * |---|---|---|
 * | ชื่อ · อีเมล · เบอร์ · รหัสนักศึกษา · รูป · การตั้งค่าแจ้งเตือน | แทน/ล้าง | ระบุตัวตนได้ตรง ๆ |
 * | Session · Account (รหัสผ่าน/โทเค็น Google) · LineLink · รหัสผูก LINE | ลบ | เข้าสู่ระบบ/ติดต่อไม่ได้อีก |
 * | การแจ้งเตือน · เหตุการณ์หน้าจอ (IP, user agent) | ลบ | ไม่มีประโยชน์ต่อสถิติของคอร์ส |
 * | PDF ใบประกาศใน storage | ลบไฟล์ + `pdfKey = null` | ฝังชื่อจริงไว้ — สร้างใหม่ด้วยชื่อ "ผู้ใช้ที่ลบบัญชีแล้ว" เมื่อมีคนขอ |
 * | `AuditLog.before/after` · `AuditLog.ip` ของการกระทำ | แทนชื่อ/อีเมล/เบอร์/รหัสด้วย `[ลบแล้ว]` · ล้าง IP | log ยังบอกได้ว่าเกิดอะไร แต่ไม่บอกว่าใคร |
 * | การลงทะเบียน · ความคืบหน้า · คะแนน · งานที่ส่ง · กระทู้ · รีวิว · ใบประกาศ | คงไว้ | สถิติของคอร์สและใบประกาศที่ตรวจสอบได้ (Q9) — ชื่อที่แสดงกลายเป็น "ผู้ใช้ที่ลบบัญชีแล้ว" เอง |
 * | คำสั่งซื้อ · ใบเสร็จ (M18) | คงไว้ · ล้างอีเมลใน snapshot ใบเสร็จ (`Order.billing.buyer.email`) | เอกสารทางบัญชีต้องเก็บตามกฎหมาย — ชื่อผู้ชำระบนใบเสร็จที่ออกแล้วคงไว้ อีเมลไม่จำเป็น (phase-4-plan ขั้น 6) |
 *
 * ผู้เรียกต้องตรวจสิทธิ์และสถานะคำขอมาก่อน · คืนจำนวนแถว audit ที่ถูกแก้ (ไว้ลง audit ของการอนุมัติ)
 */
export async function anonymizeUser(userId: string): Promise<{ auditScrubbed: number; certificatePdfs: number }> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, phone: true, externalId: true },
  });
  const needles = [user.email, user.name, user.phone, user.externalId].filter((v): v is string => !!v);

  const pdfKeys = await db.$transaction(async (tx) => {
    const certs = await tx.certificate.findMany({
      where: { userId, pdfKey: { not: null } },
      select: { pdfKey: true },
    });

    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.lineLink.deleteMany({ where: { userId } });
    // รหัสผูก LINE เก็บ userId ไว้ใน value · ลิงก์ยืนยัน/รีเซ็ตของ Better Auth ผูกกับอีเมล
    await tx.verification.deleteMany({ where: { OR: [{ value: userId }, { identifier: { contains: user.email } }] } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.screenEventLog.deleteMany({ where: { userId } });
    await tx.certificate.updateMany({ where: { userId }, data: { pdfKey: null } });
    await tx.$executeRaw`
      UPDATE "Order" SET "billing" = jsonb_set("billing", '{buyer,email}', to_jsonb(${SCRUBBED}::text))
      WHERE "userId" = ${userId} AND "billing" ? 'buyer'`;

    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: deletedEmail(userId),
        emailVerified: false,
        image: null,
        phone: null,
        externalId: null,
        notifyPrefs: {},
        banned: true,
        banReason: "ลบบัญชีตามคำขอ (PDPA)",
        banExpires: null,
        deletionRequestedAt: null,
        deletionReason: null,
        deletedAt: new Date(),
      },
    });

    return certs.map((c) => c.pdfKey!);
  });

  // ไฟล์ใน storage ลบนอก transaction — ล้มก็ไม่ย้อน DB (pdfKey เป็น null แล้ว ไฟล์เก่าไม่ถูกเสิร์ฟอีก)
  for (const key of pdfKeys) {
    await deleteObject(key).catch((error) => console.error("[privacy] ลบ PDF ใบประกาศไม่สำเร็จ", key, error));
  }

  return { auditScrubbed: await scrubAuditLog(userId, user.email, needles), certificatePdfs: pdfKeys.length };
}

type AuditJsonRow = { id: string; before: Prisma.JsonValue; after: Prisma.JsonValue };

/**
 * แถว audit ที่ผู้ใช้เป็นผู้กระทำ/เป็นเป้าหมาย ล้างได้ทุกคำ (ชื่อ อีเมล เบอร์ รหัส)
 * แถวอื่นที่บังเอิญมีอีเมลของผู้ใช้ (เช่น ผู้สอนเพิ่มผู้สอนร่วมด้วยอีเมล) ล้างเฉพาะอีเมล — ชื่อสั้น ๆ อาจตรงกับข้อความอื่น
 */
async function scrubAuditLog(userId: string, email: string, needles: string[]): Promise<number> {
  const linked = await db.auditLog.findMany({
    where: { OR: [{ actorId: userId }, { entityId: userId }] },
    select: { id: true, before: true, after: true },
  });
  const mentioning = await db.$queryRaw<AuditJsonRow[]>`
    SELECT id, before, after FROM "AuditLog"
    WHERE (before::text ILIKE ${`%${email}%`} OR after::text ILIKE ${`%${email}%`})
      AND ("actorId" IS DISTINCT FROM ${userId}) AND ("entityId" IS DISTINCT FROM ${userId})
  `;

  let changed = 0;
  const apply = async (rows: AuditJsonRow[], words: string[]) => {
    for (const row of rows) {
      const before = row.before == null ? null : scrubStrings(row.before, words);
      const after = row.after == null ? null : scrubStrings(row.after, words);
      if (JSON.stringify(before) === JSON.stringify(row.before) && JSON.stringify(after) === JSON.stringify(row.after)) {
        continue;
      }
      await db.auditLog.update({
        where: { id: row.id },
        data: {
          before: (before as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          after: (after as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
        },
      });
      changed += 1;
    }
  };
  await apply(linked, needles);
  await apply(mentioning, [email]);
  // IP ของการกระทำก็เป็นข้อมูลส่วนบุคคล
  await db.auditLog.updateMany({ where: { actorId: userId, ip: { not: null } }, data: { ip: null } });
  return changed;
}
