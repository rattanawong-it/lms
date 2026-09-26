import { Banknote, ReceiptText, TicketPercent, Undo2 } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { formatBaht } from "@/lib/payment/money";
import { cn } from "@/lib/utils";
import {
  SALES_REPORT_HEADER,
  netSales,
  type SalesReportRow,
} from "@/features/reports/lib/report";

type Summary = Omit<SalesReportRow, "title" | "departmentName"> & {
  net: string;
};
type Month = {
  key: string;
  label: string;
  orders: number;
  gross: string;
  refunded: string;
  net: string;
};

/**
 * M18 · phase-4-plan ขั้น 6 — รายงานยอดขาย (`/admin/reports?view=sales`)
 * การ์ดสรุปและตารางรายคอร์สใช้ตัวกรองช่วงวันที่ (วันที่ชำระ) · ตารางรายเดือนแสดง 12 เดือนล่าสุดเสมอ
 */
export function SalesReport({
  rows,
  summary,
  months,
}: {
  rows: SalesReportRow[];
  summary: Summary;
  months: Month[];
}) {
  return (
    <div className="space-y-5">
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        data-sales-summary
      >
        <StatCard
          label="ยอดขาย (หลังส่วนลด)"
          value={formatBaht(summary.gross)}
          icon={<Banknote className="size-[18px]" />}
          hint={`${summary.orders.toLocaleString("th-TH")} คำสั่งซื้อที่ชำระ`}
        />
        <StatCard
          label="คืนเงิน"
          value={formatBaht(summary.refunded)}
          tone="danger"
          icon={<Undo2 className="size-[18px]" />}
          hint={`${summary.refunds.toLocaleString("th-TH")} รายการ`}
        />
        <StatCard
          label="สุทธิ"
          value={formatBaht(summary.net)}
          tone="success"
          icon={<ReceiptText className="size-[18px]" />}
        />
        <StatCard
          label="ส่วนลดจากคูปอง"
          value={formatBaht(summary.discount)}
          tone="warning"
          icon={<TicketPercent className="size-[18px]" />}
          hint={`ใช้คูปอง ${summary.coupons.toLocaleString("th-TH")} ครั้ง`}
        />
      </div>

      <section
        aria-labelledby="sales-by-course"
        className="bg-card border-border overflow-hidden rounded-xl border"
      >
        <h2
          id="sales-by-course"
          className="border-line border-b px-4 py-3 text-[14px] font-semibold"
        >
          ยอดขายรายคอร์ส
        </h2>
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
            ยังไม่มียอดขายตามตัวกรองนี้
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  {SALES_REPORT_HEADER.map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(
                        "px-4 py-3 font-medium",
                        i >= 2 && "text-right",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.title}-${i}`}
                    data-report-row
                    className="border-line border-b last:border-0"
                  >
                    <th scope="row" className="px-4 py-3 font-medium">
                      {r.title}
                    </th>
                    <td className="px-4 py-3">{r.departmentName ?? "–"}</td>
                    <td className="num px-4 py-3 text-right">
                      {r.orders.toLocaleString("th-TH")}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {formatBaht(r.gross)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {formatBaht(r.discount)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {r.coupons.toLocaleString("th-TH")}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {r.refunds.toLocaleString("th-TH")}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {formatBaht(r.refunded)}
                    </td>
                    <td className="num px-4 py-3 text-right font-semibold">
                      {formatBaht(netSales(r))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="sales-by-month"
        className="bg-card border-border overflow-hidden rounded-xl border"
      >
        <h2
          id="sales-by-month"
          className="border-line border-b px-4 py-3 text-[14px] font-semibold"
        >
          ยอดขายรายเดือน (12 เดือนล่าสุด · ตามวันที่ชำระ)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="bg-background border-line text-muted-foreground border-b">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  เดือน
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  คำสั่งซื้อ
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  ยอดขาย
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  คืนเงิน
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  สุทธิ
                </th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr
                  key={m.key}
                  data-sales-month={m.key}
                  className="border-line border-b last:border-0"
                >
                  <th scope="row" className="px-4 py-3 font-medium">
                    {m.label}
                  </th>
                  <td className="num px-4 py-3 text-right">
                    {m.orders.toLocaleString("th-TH")}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {formatBaht(m.gross)}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {formatBaht(m.refunded)}
                  </td>
                  <td className="num px-4 py-3 text-right font-semibold">
                    {formatBaht(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
