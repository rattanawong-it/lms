import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatBaht, toSatang } from "@/lib/payment/money";
import { OrderStatus } from "@/generated/prisma/enums";
import { OrderStatusWatcher } from "@/features/commerce/components/order-status-watcher";
import { getMyOrder } from "@/features/commerce/queries";
import { METHOD_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/features/commerce/schemas";

export const metadata: Metadata = { title: "คำสั่งซื้อ" };

/**
 * M18 · FR-18.1 — สถานะคำสั่งซื้อ (หน้าที่ gateway ส่งผู้ซื้อกลับมา)
 * ไม่ตัดสินผลจาก query string — แสดงสถานะใน DB และระหว่าง PENDING ให้ `OrderStatusWatcher` ถามผลซ้ำ
 */
export default async function OrderPage(props: PageProps<"/orders/[orderId]">) {
  const { orderId } = await props.params;
  const order = await getMyOrder(orderId);

  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="คำสั่งซื้อ" description={order.courseTitle} />

      <section className="bg-card border-border space-y-4 rounded-xl border p-5" data-order-status={order.status}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary" className={`${ORDER_STATUS_TONE[order.status]} text-[13px]`}>
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
          <span className="num text-[20px] font-bold">{formatBaht(order.amount)}</span>
        </div>

        {order.status === OrderStatus.PENDING ? <OrderStatusWatcher orderId={order.id} /> : null}

        {order.status === OrderStatus.PAID ? (
          <div className="space-y-3">
            <p className="bg-success-bg text-success-fg rounded-lg p-3 text-[13px]">
              ชำระเงินสำเร็จ — เริ่มเรียนได้ทันที
            </p>
            <Button asChild className="h-11 w-full">
              <Link href={`/learn/${order.courseId}`}>เริ่มเรียน</Link>
            </Button>
          </div>
        ) : null}

        {order.status === OrderStatus.FAILED ? (
          <div className="space-y-3">
            <p className="bg-muted rounded-lg p-3 text-[13px]">
              {order.failureReason ?? "การชำระเงินไม่สำเร็จ"} — ยังไม่มีการตัดเงิน หรือหากถูกตัดแล้วระบบจะเปิดสิทธิ์ให้อัตโนมัติเมื่อได้รับผล
            </p>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={`/checkout/${order.courseId}`}>ลองชำระอีกครั้ง</Link>
            </Button>
          </div>
        ) : null}

        <dl className="border-line space-y-1.5 border-t pt-3 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">เลขที่คำสั่งซื้อ</dt>
            <dd className="num font-mono break-all">{order.id}</dd>
          </div>
          {toSatang(order.discount) > 0 ? (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">ราคาคอร์ส</dt>
                <dd className="num">{formatBaht(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">ส่วนลด{order.couponCode ? ` (คูปอง ${order.couponCode})` : ""}</dt>
                <dd className="num" data-order-discount>
                  −{formatBaht(order.discount)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">สร้างเมื่อ</dt>
            <dd className="num">{formatDateTime(order.createdAt)}</dd>
          </div>
          {order.paidAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">ชำระเมื่อ</dt>
              <dd className="num">{formatDateTime(order.paidAt)}</dd>
            </div>
          ) : null}
          {order.method ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">วิธีชำระ</dt>
              <dd>{METHOD_LABEL[order.method] ?? order.method}</dd>
            </div>
          ) : null}
        </dl>
        <Link href="/orders" className="text-primary inline-block min-h-11 py-2 text-[13px] underline-offset-2 hover:underline">
          ดูคำสั่งซื้อทั้งหมด
        </Link>
      </section>
    </div>
  );
}
