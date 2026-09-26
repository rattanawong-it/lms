import "server-only";
import { db } from "@/lib/db";
import { toSatang } from "@/lib/payment/money";
import type { Prisma } from "@/generated/prisma/client";
import { BRANDING_SETTING_KEY, SELLER_SETTING_KEY, parseBranding, parseSeller, type Seller } from "@/features/settings/schemas";
import { nextReceiptNo } from "@/features/commerce/lib/receipt-number";
import type { ReceiptBilling, ReceiptInput } from "@/features/commerce/lib/receipt-model";

/**
 * M18 · FR-18.2 — ออกใบเสร็จรับเงิน
 *
 * `issueReceipt()` เรียกจาก `grantPurchase()` ในทรานแซกชันเดียวกับที่คำสั่งซื้อเป็น PAID:
 * ออกเลขต่อเนื่อง + เก็บ snapshot ผู้ขาย/ผู้ซื้อลง `Order.billing` (แก้ข้อมูลภายหลัง ใบเดิมไม่เปลี่ยน)
 * ยอด 0 บาท (คูปองลดเต็มจำนวน) ไม่ออกใบเสร็จ — ไม่มีการรับเงิน · เลขจึงไม่ข้ามเพราะไม่ได้ขอเลขเลย
 */

async function readSeller(client: Prisma.TransactionClient | typeof db): Promise<Seller> {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: [SELLER_SETTING_KEY, BRANDING_SETTING_KEY] } },
    select: { key: true, value: true },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
  return parseSeller(value(SELLER_SETTING_KEY), parseBranding(value(BRANDING_SETTING_KEY)).name);
}

export async function issueReceipt(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string; amount: { toString(): string } },
  paidAt: Date,
): Promise<string | null> {
  if (toSatang(order.amount) === 0) return null;
  const current = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { receiptNo: true } });
  if (current.receiptNo) return current.receiptNo;

  const [seller, buyer] = await Promise.all([
    readSeller(tx),
    tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { name: true, email: true } }),
  ]);
  const billing: ReceiptBilling = { seller, buyer: { name: buyer.name, email: buyer.email } };
  const receiptNo = await nextReceiptNo(tx, paidAt);
  await tx.order.update({ where: { id: order.id }, data: { receiptNo, billing } });
  return receiptNo;
}

/** แปลงแถวคำสั่งซื้อเป็นข้อมูลใบเสร็จ · ไม่มีเลข/snapshot = ยังไม่ได้ออกใบ */
export function receiptInputOf(order: {
  id: string;
  receiptNo: string | null;
  billing: Prisma.JsonValue;
  paidAt: Date | null;
  subtotal: { toString(): string };
  discount: { toString(): string };
  amount: { toString(): string };
  couponCode: string | null;
  method: string | null;
  course: { title: string };
}): ReceiptInput | null {
  const billing = order.billing as ReceiptBilling | null;
  if (!order.receiptNo || !order.paidAt || !billing?.seller || !billing.buyer) return null;
  return {
    receiptNo: order.receiptNo,
    orderId: order.id,
    paidAt: order.paidAt,
    courseTitle: order.course.title,
    subtotal: order.subtotal.toString(),
    discount: order.discount.toString(),
    amount: order.amount.toString(),
    couponCode: order.couponCode,
    method: order.method,
    billing,
  };
}
