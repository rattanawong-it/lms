import "server-only";
import { db } from "@/lib/db";
import { OrderStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { quoteCoupon, type CouponQuote } from "@/features/commerce/lib/coupon";

/**
 * M18 · FR-18.2 — ตรวจคูปองกับข้อมูลจริงใน DB
 *
 * `lock: true` (ใช้ใน transaction ตอนสร้างคำสั่งซื้อ) ล็อกแถวคูปองก่อนนับสิทธิ์ที่จองไว้
 * สองคนกดพร้อมกันกับคูปองที่เหลือสิทธิ์เดียว คนหลังจะเห็นคำสั่งซื้อของคนแรกในการนับแล้วถูกปฏิเสธ
 */
type Client = Prisma.TransactionClient | typeof db;

export async function findCouponQuote(
  client: Client,
  code: string,
  ctx: { courseId: string; subtotal: string; lock?: boolean },
): Promise<CouponQuote & { couponId?: string }> {
  if (ctx.lock) await client.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${code} FOR UPDATE`;
  const coupon = await client.coupon.findUnique({
    where: { code },
    select: {
      id: true,
      percentOff: true,
      amountOff: true,
      maxUses: true,
      usedCount: true,
      validFrom: true,
      validUntil: true,
      active: true,
      courseId: true,
    },
  });
  const now = new Date();
  const reserved = coupon?.maxUses
    ? await client.order.count({ where: { couponId: coupon.id, status: OrderStatus.PENDING, expiresAt: { gt: now } } })
    : 0;
  const quote = quoteCoupon(coupon, { courseId: ctx.courseId, subtotal: ctx.subtotal, now, reserved });
  return quote.ok ? { ...quote, couponId: coupon!.id } : quote;
}
