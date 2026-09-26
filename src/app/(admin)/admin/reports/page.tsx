import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getReport, getReportFilterOptions, getSalesTrend } from "@/features/reports/queries";
import {
  COURSE_REPORT_HEADER,
  LEARNER_REPORT_HEADER,
  REPORT_EXPORT_MAX,
  REPORT_VIEWS,
  completionRate,
  formatRate,
  learnerStatusLabel,
  parseReportParams,
  reportQuery,
  type ReportView,
} from "@/features/reports/lib/report";
import { ExportButtons } from "@/features/reports/components/export-buttons";
import { SalesReport } from "@/features/reports/components/sales-report";

export const metadata: Metadata = { title: "รายงาน" };

const VIEW_LABEL: Record<ReportView, string> = { course: "รายคอร์ส", learner: "รายผู้เรียน", sales: "ยอดขาย" };

const TOTAL_UNIT: Record<ReportView, string> = { course: "คอร์ส", learner: "การลงทะเบียน", sales: "คอร์สที่มียอดขาย" };

const selectClass =
  "border-input bg-card focus-visible:ring-ring h-11 w-full rounded-[9px] border px-3 text-[14px] outline-none focus-visible:ring-2";

/**
 * M16 · FR-16.4 — รายงานความคืบหน้ารายคอร์ส/รายผู้เรียน + ส่งออก CSV/XLSX
 * ตัวกรองอยู่ใน URL (ฟอร์ม GET) · ผู้ดูแลคณะเห็นเฉพาะคณะตัวเอง (บังคับใน query ไม่ใช่แค่ซ่อนตัวเลือก)
 * ช่วงวันที่กรองตามวันที่ลงทะเบียน (เวลาไทย) · มุมมองยอดขาย (M18) กรองตามวันที่ชำระ
 */
export default async function AdminReportsPage(props: PageProps<"/admin/reports">) {
  const params = parseReportParams(await props.searchParams);
  const [options, report, salesTrend] = await Promise.all([
    getReportFilterOptions(),
    getReport(params),
    params.view === "sales" ? getSalesTrend(params) : null,
  ]);
  const query = reportQuery(params);

  return (
    <>
      <PageHeader
        title="รายงาน"
        description={`ความคืบหน้า การเรียนจบ และยอดขาย · ส่งออกได้สูงสุด ${REPORT_EXPORT_MAX.toLocaleString("th-TH")} แถวต่อครั้ง`}
        actions={<ExportButtons target={{ kind: "report", filters: query }} />}
      />

      <nav aria-label="มุมมองรายงาน" className="mb-4 flex gap-1.5">
        {REPORT_VIEWS.map((v) => (
          <Link
            key={v}
            href={`/admin/reports?${new URLSearchParams(reportQuery(params, { view: v }))}`}
            aria-current={v === params.view ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium",
              v === params.view ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border hover:bg-muted",
            )}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>

      <form
        aria-label="ตัวกรองรายงาน"
        className="bg-card border-border mb-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_auto] lg:items-end"
      >
        <input type="hidden" name="view" value={params.view} />
        <div className="space-y-1">
          <label htmlFor="report-department" className="text-[12.5px] font-medium">คณะ</label>
          {options.canChooseDepartment ? (
            <select id="report-department" name="department" defaultValue={params.departmentId ?? ""} className={selectClass}>
              <option value="">ทุกคณะ</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          ) : (
            <p id="report-department" className="text-fg-2 flex h-11 items-center text-[13.5px]">
              {options.departments[0]?.name ?? "คณะของคุณ"}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="report-course" className="text-[12.5px] font-medium">คอร์ส</label>
          <select id="report-course" name="course" defaultValue={params.courseId ?? ""} className={selectClass}>
            <option value="">ทุกคอร์ส</option>
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="report-from" className="text-[12.5px] font-medium">
            {params.view === "sales" ? "ชำระตั้งแต่" : "ลงทะเบียนตั้งแต่"}
          </label>
          <input id="report-from" type="date" name="from" defaultValue={params.from ?? ""} className={selectClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="report-to" className="text-[12.5px] font-medium">ถึง</label>
          <input id="report-to" type="date" name="to" defaultValue={params.to ?? ""} className={selectClass} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11">
            <Filter className="size-4" /> กรอง
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link href={`/admin/reports?view=${params.view}`}>ล้าง</Link>
          </Button>
        </div>
      </form>

      <p className="text-muted-foreground mb-2 text-[12.5px]" data-report-total>
        พบ {report.total.toLocaleString("th-TH")} {TOTAL_UNIT[params.view]}
      </p>

      {report.view === "sales" ? (
        <SalesReport rows={report.rows} summary={report.summary} months={salesTrend ?? []} />
      ) : report.total === 0 ? (
        <EmptyState
          icon={<FileBarChart className="size-5" />}
          title="ไม่มีข้อมูลตามตัวกรองนี้"
          description="ลองขยายช่วงวันที่ หรือเลือกทุกคอร์ส"
        />
      ) : (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            {report.view === "course" ? (
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <caption className="sr-only">รายงานรายคอร์ส</caption>
                <thead className="bg-background border-line text-muted-foreground border-b">
                  <tr>
                    {COURSE_REPORT_HEADER.map((h, i) => (
                      <th key={h} scope="col" className={cn("px-4 py-3 font-medium", i >= 2 && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={`${r.title}-${i}`} data-report-row className="border-line border-b last:border-0">
                      <th scope="row" className="px-4 py-3 font-medium">{r.title}</th>
                      <td className="px-4 py-3">{r.departmentName ?? "–"}</td>
                      <td className="num px-4 py-3 text-right">{r.enrolled.toLocaleString("th-TH")}</td>
                      <td className="num px-4 py-3 text-right">{r.active.toLocaleString("th-TH")}</td>
                      <td className="num px-4 py-3 text-right">{r.completed.toLocaleString("th-TH")}</td>
                      <td className="num px-4 py-3 text-right font-semibold">{formatRate(completionRate(r.completed, r.enrolled))}</td>
                      <td className="num px-4 py-3 text-right">{r.avgProgress === null ? "–" : `${r.avgProgress}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <caption className="sr-only">รายงานรายผู้เรียน</caption>
                <thead className="bg-background border-line text-muted-foreground border-b">
                  <tr>
                    {LEARNER_REPORT_HEADER.map((h) => (
                      <th key={h} scope="col" className={cn("px-4 py-3 font-medium", h.startsWith("ความคืบหน้า") && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={`${r.email}-${r.courseTitle}-${i}`} data-report-row className="border-line border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.externalId ?? "–"}</td>
                      <th scope="row" className="px-4 py-3 font-medium">{r.name}</th>
                      <td className="text-muted-foreground px-4 py-3 break-all">{r.email}</td>
                      <td className="px-4 py-3">{r.courseTitle}</td>
                      <td className="px-4 py-3">{learnerStatusLabel(r)}</td>
                      <td className="num px-4 py-3 text-right">{r.progressPct}%</td>
                      <td className="num px-4 py-3">{formatDate(r.enrolledAt)}</td>
                      <td className="num px-4 py-3">{r.completedAt ? formatDate(r.completedAt) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      <Pager basePath="/admin/reports" params={query} page={params.page} pageCount={report.pageCount} />
    </>
  );
}
