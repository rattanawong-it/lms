import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/rbac";
import { formatBaht } from "@/lib/payment/money";
import { OrderStatus } from "@/generated/prisma/enums";
import { MockPayForm } from "@/features/commerce/components/mock-pay-form";

export const metadata: Metadata = { title: "หน้าชำระเงินจำลอง", robots: { index: false } };

/**
 * M18 — หน้าชำระเงินจำลองแทนหน้าของ gateway (**เฉพาะ `PAYMENT_PROVIDER=mock`** — อย่างอื่นตอบ 404)
 * แสดงได้เฉพาะเจ้าของคำสั่งซื้อที่ยังรอชำระ และ `ref` ต้องตรงกับที่ผู้ให้บริการจำลองออกให้
 */
export default async function MockCheckoutPage(props: PageProps<"/checkout/mock/[orderId]">) {
  if (env.PAYMENT_PROVIDER !== "mock") notFound();
  const user = await requireUser();
  const { orderId } = await props.params;
  const ref = (await props.searchParams).ref;

  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id, providerRef: typeof ref === "string" ? ref : "__none__", status: OrderStatus.PENDING },
    select: { id: true, amount: true, providerRef: true, course: { select: { title: true } } },
  });
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <p className="bg-warning-bg text-warning-fg rounded-lg p-3 text-[12.5px] font-medium" role="note">
        โหมดจำลอง — ไม่มีการเก็บเงินจริง ใช้สำหรับพัฒนาและทดสอบระบบเท่านั้น
      </p>
      <section aria-labelledby="mock-pay" className="bg-card border-border space-y-4 rounded-xl border p-5">
        <h1 id="mock-pay" className="text-[18px] font-bold">
          ชำระเงิน (จำลอง)
        </h1>
        <p className="text-[14px]">{order.course.title}</p>
        <p className="num text-[24px] font-bold" data-mock-amount>
          {formatBaht(order.amount.toString())}
        </p>
        <MockPayForm orderId={order.id} providerRef={order.providerRef!} />
      </section>
    </div>
  );
}
