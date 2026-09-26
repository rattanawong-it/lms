import type { Prisma } from "@/generated/prisma/client";

/**
 * M18 · FR-18.2 — เลขที่ใบเสร็จ `RC2569-000001` เรียงต่อเนื่องต่อปี พ.ศ. (เวลาไทย)
 *
 * ไม่มี `server-only` — สคริปต์ fixture ของ e2e เรียก `nextReceiptNo()` ตรงเพื่อทดสอบการออกเลขพร้อมกัน
 * ต้องเรียกใน transaction เดียวกับที่คำสั่งซื้อเป็น PAID: ถ้า transaction ล้ม ตัวนับย้อนกลับด้วย เลขจึงไม่ข้าม
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` ล็อกแถวตัวนับจน transaction จบ — สองรายการพร้อมกันได้เลขไม่ซ้ำ
 */

/** ปี พ.ศ. ของเวลานั้นตามเวลาไทย (31 ธ.ค. 17:30 UTC = 1 ม.ค. ของปีถัดไปในไทย) */
export function buddhistYear(at: Date): number {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear() + 543;
}

export function formatReceiptNo(year: number, seq: number): string {
  return `RC${year}-${String(seq).padStart(6, "0")}`;
}

/** ตัวนับเอกสารตาม key — ได้เลขถัดไป (เริ่ม 1) · ล็อกแถวตัวนับจน transaction จบ */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "DocumentCounter"."value" + 1
    RETURNING "value"`;
  return rows[0]!.value;
}

export async function nextReceiptNo(tx: Prisma.TransactionClient, at: Date): Promise<string> {
  const year = buddhistYear(at);
  return formatReceiptNo(year, await nextDocumentNumber(tx, `receipt:${year}`));
}
