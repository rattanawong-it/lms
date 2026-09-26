import { describe, expect, it } from "vitest";
import {
  SALES_REPORT_HEADER,
  fillSalesMonths,
  lastMonths,
  netSales,
  parseReportParams,
  salesReportTable,
  sumSales,
  type SalesReportRow,
} from "@/features/reports/lib/report";

const row = (over: Partial<SalesReportRow> = {}): SalesReportRow => ({
  title: "Excel สำหรับการทำงาน",
  departmentName: "คณะบริหารธุรกิจ",
  orders: 3,
  gross: "2079.10",
  discount: "891.00",
  coupons: 2,
  refunds: 1,
  refunded: "693.30",
  ...over,
});

describe("ยอดขาย (M18 · phase-4-plan ขั้น 6)", () => {
  it("สุทธิคิดเป็นสตางค์ ไม่เพี้ยนแบบ float", () => {
    expect(netSales(row())).toBe("1385.80");
    expect(netSales({ gross: "0.30", refunded: "0.10" })).toBe("0.20");
    expect(netSales({ gross: "100.00", refunded: "100.00" })).toBe("0.00");
  });

  it("รวมหลายคอร์ส", () => {
    expect(sumSales([row(), row({ orders: 1, gross: "0.10", discount: "0.20", coupons: 0, refunds: 0, refunded: "0.00" })])).toEqual({
      orders: 4,
      gross: "2079.20",
      discount: "891.20",
      coupons: 2,
      refunds: 1,
      refunded: "693.30",
    });
    expect(sumSales([])).toEqual({ orders: 0, gross: "0.00", discount: "0.00", coupons: 0, refunds: 0, refunded: "0.00" });
  });

  it("ตารางส่งออก — เงินเป็นตัวเลข · ชื่อคอร์สกันสูตร", () => {
    const table = salesReportTable([row({ title: "=HYPERLINK(1)" })]);
    expect(table[0]).toEqual(SALES_REPORT_HEADER);
    expect(table[1]).toEqual(["'=HYPERLINK(1)", "คณะบริหารธุรกิจ", 3, 2079.1, 891, 2, 1, 693.3, 1385.8]);
  });

  it("รายเดือนเติมเดือนที่ไม่มียอดเป็น 0", () => {
    const months = lastMonths(new Date("2026-09-26T05:00:00Z"), 3);
    expect(fillSalesMonths(months, [{ month: "2026-08", orders: 2, gross: "1800.00", refunded: "900.00" }])).toEqual([
      { key: "2026-07", label: "ก.ค. 69", orders: 0, gross: "0.00", refunded: "0.00", net: "0.00" },
      { key: "2026-08", label: "ส.ค. 69", orders: 2, gross: "1800.00", refunded: "900.00", net: "900.00" },
      { key: "2026-09", label: "ก.ย. 69", orders: 0, gross: "0.00", refunded: "0.00", net: "0.00" },
    ]);
  });

  it("มุมมอง sales ใน URL", () => {
    expect(parseReportParams({ view: "sales" }).view).toBe("sales");
    expect(parseReportParams({ view: "hack" }).view).toBe("course");
  });
});
