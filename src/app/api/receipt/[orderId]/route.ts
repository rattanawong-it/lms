import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { buildReceiptModel } from "@/features/commerce/lib/receipt-model";
import { renderReceiptPdf } from "@/features/commerce/lib/receipt-pdf";
import { receiptInputOf } from "@/features/commerce/lib/receipt";
import { orderIdSchema } from "@/features/commerce/schemas";

/**
 * M18 · FR-18.2 — ดาวน์โหลด PDF ใบเสร็จรับเงิน
 *
 * เจ้าของคำสั่งซื้อ หรือ SUPER_ADMIN · คนอื่น = ไม่พบ (ไม่บอกว่ามีอยู่)
 * สร้าง PDF ใหม่ทุกครั้งจาก snapshot ใน `Order.billing` (ไม่เก็บไฟล์) · คืนเงินแล้วใบเดิมยังดาวน์โหลดได้
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireApiUser();
  const parsed = orderIdSchema.safeParse({ orderId: (await params).orderId });
  if (!parsed.success) notFound();

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    select: {
      id: true,
      userId: true,
      receiptNo: true,
      billing: true,
      paidAt: true,
      subtotal: true,
      discount: true,
      amount: true,
      couponCode: true,
      method: true,
      course: { select: { title: true } },
    },
  });
  if (!order || (order.userId !== user.id && user.role !== Role.SUPER_ADMIN)) notFound();
  const input = receiptInputOf(order);
  if (!input) notFound();

  const pdf = await renderReceiptPdf(buildReceiptModel(input));
  const filename = `ใบเสร็จ-${input.receiptNo}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${input.receiptNo}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
