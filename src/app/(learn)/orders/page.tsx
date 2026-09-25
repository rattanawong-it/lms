import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { formatBaht } from "@/lib/payment/money";
import { listMyOrders } from "@/features/commerce/queries";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/features/commerce/schemas";

export const metadata: Metadata = { title: "คำสั่งซื้อของฉัน" };

/** M18 · FR-18.1 — ประวัติการสั่งซื้อ */
export default async function OrdersPage() {
  const orders = await listMyOrders();

  return (
    <>
      <PageHeader title="คำสั่งซื้อของฉัน" description="ประวัติการซื้อคอร์สและสถานะการชำระเงิน" />
      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" />}
          title="ยังไม่มีคำสั่งซื้อ"
          description="เมื่อคุณซื้อคอร์สที่มีค่าใช้จ่าย รายการจะแสดงที่นี่"
        />
      ) : (
        <ul className="bg-card border-border divide-line divide-y overflow-hidden rounded-xl border">
          {orders.map((o) => (
            <li key={o.id} data-order={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="hover:bg-muted/50 grid min-h-11 grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.courseTitle}</span>
                  <span className="text-muted-foreground num block text-[12px]">{formatDateTime(o.createdAt)}</span>
                </span>
                <span className="num font-semibold">{formatBaht(o.amount)}</span>
                <span>
                  <Badge variant="secondary" className={ORDER_STATUS_TONE[o.status]}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
