"use server";

import { toCsv } from "@/lib/csv";
import { toXlsx } from "@/lib/xlsx";
import { writeAudit } from "@/lib/audit";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import {
  courseReportTable,
  learnerReportTable,
  parseReportParams,
  salesReportTable,
  type ReportView,
} from "@/features/reports/lib/report";
import { getCourseProgressForExport, getReportForExport } from "@/features/reports/queries";

/**
 * M16 · FR-16.4 — ส่งออกรายงานเป็น CSV/XLSX
 * คืนไฟล์เป็น base64 ให้ `saveBase64()` ฝั่ง client (แบบเดียวกับส่งออกสมุดคะแนน) · บันทึก AuditLog ทุกครั้ง
 */

export type ExportFile = { filename: string; mime: string; base64: string };
type Format = "csv" | "xlsx";

const EXPORT_NAME: Record<ReportView, string> = { course: "รายงานรายคอร์ส", learner: "รายงานรายผู้เรียน", sales: "รายงานยอดขาย" };
const EXPORT_SHEET: Record<ReportView, string> = { course: "รายคอร์ส", learner: "รายผู้เรียน", sales: "ยอดขาย" };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function toFile(name: string, sheet: string, table: (string | number)[][], format: Format): Promise<ExportFile> {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  if (format === "xlsx") {
    return { filename: `${safe}.xlsx`, mime: XLSX_MIME, base64: (await toXlsx(sheet, table)).toString("base64") };
  }
  return { filename: `${safe}.csv`, mime: "text/csv;charset=utf-8", base64: Buffer.from(toCsv(table), "utf8").toString("base64") };
}

/** `/admin/reports` — ตัวกรองชุดเดียวกับหน้าจอ (ตรวจขอบเขตคณะซ้ำใน query) */
export async function exportReport(filters: Record<string, string>, format: Format): Promise<ExportFile> {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);
  const params = parseReportParams(filters);
  const data = await getReportForExport(params);
  const table =
    data.view === "course"
      ? courseReportTable(data.rows)
      : data.view === "sales"
        ? salesReportTable(data.rows)
        : learnerReportTable(data.rows);

  await writeAudit({
    actorId: actor.id,
    action: "report.export",
    entity: "Report",
    after: { view: params.view, format, rows: data.rows.length, filters: { ...params, page: undefined } },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return toFile(`${EXPORT_NAME[data.view]} ${stamp}`, EXPORT_SHEET[data.view], table,
    format === "xlsx" ? "xlsx" : "csv",
  );
}

/** `/teach/courses/[id]/students` — ความคืบหน้าผู้เรียนของคอร์ส (ผู้สอน/ผู้ดูแลคอร์ส) */
export async function exportCourseProgress(courseId: string, format: Format): Promise<ExportFile> {
  const { access, course, rows } = await getCourseProgressForExport(courseId);
  await writeAudit({
    actorId: access.user.id,
    action: "course.progress.export",
    entity: "Course",
    entityId: courseId,
    after: { format, rows: rows.length },
  });
  return toFile(`ความคืบหน้า ${course.title}`, "ความคืบหน้า", learnerReportTable(rows, false), format === "xlsx" ? "xlsx" : "csv");
}
