"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendPoint } from "@/features/reports/components/enrollment-trend-chart";

const Chart = dynamic(() => import("@/features/reports/components/enrollment-trend-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-[240px] w-full rounded-lg" />,
});

/**
 * กราฟแนวโน้มการลงทะเบียน + ตารางตัวเลขเดียวกันสำหรับผู้อ่านหน้าจอ (กราฟเป็น aria-hidden)
 */
export function EnrollmentTrend({ data }: { data: TrendPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <figure aria-labelledby="trend-caption" className="bg-card border-border rounded-xl border p-4 sm:p-5">
      <figcaption id="trend-caption" className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">การลงทะเบียน 12 เดือนล่าสุด</span>
        <span className="text-muted-foreground num text-[12.5px]">รวม {total.toLocaleString("th-TH")} ครั้ง</span>
      </figcaption>
      <div className="mt-3" aria-hidden>
        <Chart data={data} />
      </div>
      <table className="sr-only">
        <caption>จำนวนการลงทะเบียนรายเดือน</caption>
        <thead>
          <tr>
            <th scope="col">เดือน</th>
            <th scope="col">จำนวน</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
