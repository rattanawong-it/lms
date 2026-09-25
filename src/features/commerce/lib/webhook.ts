import "server-only";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import { settleOrder } from "@/features/commerce/lib/settle";
import type { Prisma } from "@/generated/prisma/client";

/**
 * M18 · FR-18.1 — รับ webhook ของผู้ให้บริการ (`/api/payment/webhook/[provider]` และหน้าชำระจำลองเรียกตรง)
 *
 * 1. ผู้ให้บริการต้องตรงกับที่ตั้งค่าไว้ · 2. ตรวจลายเซ็นกับ body ดิบ · 3. บันทึก `PaymentEvent` (unique eventId)
 * 4. `settleOrder()` ถามสถานะจากผู้ให้บริการเองแล้วค่อยเปลี่ยนข้อมูล · 5. ตั้ง `processedAt`
 * event ที่เคยประมวลผลแล้วตอบ 200 ทันที · ที่เคยรับแต่ล้มกลางทางประมวลผลใหม่ (gateway ยิงซ้ำเมื่อไม่ได้ 2xx)
 */
export async function handlePaymentWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
): Promise<{ status: number; message: string }> {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== providerName) return { status: 404, message: "not found" };

  const event = provider.verifyWebhook(rawBody, headers);
  if (!event) return { status: 400, message: "invalid signature" };

  const order = await db.order.findUnique({ where: { providerRef: event.providerRef }, select: { id: true } });

  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  } catch {
    payload = { raw: rawBody.slice(0, 2000) };
  }

  const record = await db.paymentEvent.upsert({
    where: { provider_eventId: { provider: provider.name, eventId: event.eventId } },
    create: { provider: provider.name, eventId: event.eventId, type: event.type, orderId: order?.id ?? null, payload },
    update: {},
    select: { id: true, processedAt: true },
  });
  if (record.processedAt) return { status: 200, message: "duplicate" };

  // ไม่รู้จักคำสั่งซื้อ (เช่น charge ที่สร้างจากที่อื่น) — เก็บ event ไว้เป็นหลักฐาน ไม่ทำอะไรต่อ
  if (order) await settleOrder(order.id);

  await db.paymentEvent.update({ where: { id: record.id }, data: { processedAt: new Date() } });
  return { status: 200, message: "ok" };
}
