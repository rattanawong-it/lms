import type { Metadata } from "next";
import Link from "next/link";
import { Filter, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { formatDateTime } from "@/lib/dates";
import { formatBaht, toSatang } from "@/lib/payment/money";
import { OrderStatus } from "@/generated/prisma/enums";
import { RecheckButton, RefundButton } from "@/features/commerce/components/refund-button";
import { listAdminOrders } from "@/features/commerce/queries";
import {
  METHOD_LABEL,
  ORDER_FILTER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  orderQuery,
  parseOrderFilter,
} from "@/features/commerce/schemas";

export const metadata: Metadata = { title: "คำสั่งซื้อ" };

const inputClass =
  "border-input bg-card focus-visible:ring-ring h-11 w-full rounded-[9px] border px-3 text-[14px] outline-none focus-visible:ring-2";

/** M18 · FR-18.2 — ค้นหาคำสั่งซื้อ · คืนเงิน (Q6) · ตรวจสถานะกับผู้ให้บริการ (SUPER_ADMIN) */
export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const filter = parseOrderFilter(await props.searchParams);
  const { rows, total, pageCount } = await listAdminOrders(filter);
  const query = orderQuery(filter);
  const filtered = Object.keys(query).length > 0;

  return (
    <>
      <PageHeader
        title="คำสั่งซื้อ"
        description="คืนเงินได้ตามนโยบายภายใน 7 วันหลังชำระและเรียนไม่เกิน 20% · นอกเงื่อนไขคืนได้เป็นกรณีพิเศษพร้อมเหตุผล"
      />

      <form
        aria-label="ตัวกรองคำสั่งซื้อ"
        className="bg-card border-border mb-4 grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_160px_150px_150px_auto] xl:items-end"
      >
        <div className="min-w-0 space-y-1">
          <label htmlFor="or-q" className="text-[12.5px] font-medium">
            ค้นหา (อีเมล ชื่อ คอร์ส เลขคำสั่งซื้อ/ใบเสร็จ)
          </label>
          <input id="or-q" name="q" defaultValue={filter.q} className={inputClass} />
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="or-status" className="text-[12.5px] font-medium">
            สถานะ
          </label>
          <select id="or-status" name="status" defaultValue={filter.status ?? ""} className={inputClass}>
            <option value="">ทุกสถานะ</option>
            {ORDER_FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="or-from" className="text-[12.5px] font-medium">
            สั่งซื้อตั้งแต่วันที่
          </label>
          <input id="or-from" type="date" name="from" defaultValue={filter.from ?? ""} className={inputClass} />
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="or-to" className="text-[12.5px] font-medium">
            ถึง
          </label>
          <input id="or-to" type="date" name="to" defaultValue={filter.to ?? ""} className={inputClass} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11">
            <Filter className="size-4" /> ค้นหา
          </Button>
          {filtered ? (
            <Button asChild variant="ghost" className="h-11">
              <Link href="/admin/orders">ล้าง</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <p className="text-muted-foreground mb-3 text-[12.5px]">
        พบ <span className="num">{total.toLocaleString("th-TH")}</span> รายการ
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title={filtered ? "ไม่พบคำสั่งซื้อที่ตรงกับตัวกรอง" : "ยังไม่มีคำสั่งซื้อ"}
          description="คำสั่งซื้อเกิดเมื่อผู้เรียนกดซื้อคอร์สที่มีราคา"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {rows.map((o) => (
            <li key={o.id} className="min-w-0">
              <article
                aria-label={`คำสั่งซื้อ ${o.id}`}
                data-admin-order={o.id}
                className="bg-card border-border flex flex-wrap items-start gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="num text-[15px] font-semibold">{formatBaht(o.amount)}</span>
                    <Badge variant="secondary" className={`${ORDER_STATUS_TONE[o.status]} border-0`}>
                      {o.refundPending ? "รอยืนยันการคืนเงิน" : ORDER_STATUS_LABEL[o.status]}
                    </Badge>
                    {o.receiptNo ? <span className="num font-mono text-[12px]">{o.receiptNo}</span> : null}
                  </p>
                  <p className="truncate text-[13.5px]">{o.course.title}</p>
                  <p className="text-fg-2 text-[12.5px] break-all">
                    {o.buyer.name} ({o.buyer.email})
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    สั่งซื้อ {formatDateTime(o.createdAt)}
                    {o.paidAt ? ` · ชำระ ${formatDateTime(o.paidAt)}` : ""}
                    {o.method ? ` · ${METHOD_LABEL[o.method] ?? o.method}` : ""}
                    {toSatang(o.discount) > 0
                      ? ` · ส่วนลด ${formatBaht(o.discount)}${o.couponCode ? ` (${o.couponCode})` : ""}`
                      : ""}
                    {o.status === OrderStatus.PAID ? ` · เรียนไปแล้ว ${o.progressPct}%` : ""}
                  </p>
                  {o.status === OrderStatus.REFUNDED ? (
                    <p className="text-danger-fg text-[12.5px]">
                      คืนเงิน {o.refundedAt ? formatDateTime(o.refundedAt) : ""} — {o.refundReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {o.receiptNo ? (
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <a href={`/api/receipt/${o.id}`} download>
                        ใบเสร็จ
                      </a>
                    </Button>
                  ) : null}
                  {o.status === OrderStatus.PENDING || o.refundPending ? <RecheckButton orderId={o.id} /> : null}
                  {o.refund.kind !== "blocked" && !o.refundPending ? (
                    <RefundButton
                      orderId={o.id}
                      amount={o.amount}
                      buyer={o.buyer.name}
                      course={o.course.title}
                      check={o.refund}
                    />
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Pager basePath="/admin/orders" params={query} page={filter.page} pageCount={pageCount} />
    </>
  );
}
