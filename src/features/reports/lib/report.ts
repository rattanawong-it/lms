import { z } from "zod";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { ENROLLMENT_STATUS_LABEL } from "@/features/enrollment/lib/labels";
import { fromSatang, toSatang } from "@/lib/payment/money";

/**
 * M16 · FR-16.1–16.4 — สูตรและรูปแบบรายงาน (pure ทั้งไฟล์ — ใช้ทั้ง server, หน้าจอ และ unit test)
 */

/** สถานะที่นับเป็น "ได้เข้าเรียน" ในอัตราการเรียนจบ — ไม่นับรออนุมัติ/ถอนตัว */
export const COUNTED_STATUSES = [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED, EnrollmentStatus.EXPIRED] as const;

/** อัตราการเรียนจบ (%) ทศนิยม 1 ตำแหน่ง · ไม่มีผู้เรียนเลย = null (แสดง "–" ไม่ใช่ 0%) */
export function completionRate(completed: number, enrolled: number): number | null {
  if (enrolled <= 0) return null;
  return Math.round((Math.min(completed, enrolled) / enrolled) * 1000) / 10;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "–" : `${rate.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * เดือนย้อนหลัง n เดือน (รวมเดือนนี้) ตามเวลาไทย เรียงเก่า → ใหม่
 * key เป็น "YYYY-MM" (ค.ศ. ตรงกับ `to_char` ใน SQL) · label เป็น พ.ศ. ย่อ "ก.ย. 69"
 */
export function lastMonths(now: Date, n: number): { key: string; label: string; start: Date }[] {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (n - 1 - i), 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: `${TH_MONTH[month]} ${String((year + 543) % 100).padStart(2, "0")}`,
      // เที่ยงคืนวันที่ 1 ตามเวลาไทย
      start: new Date(Date.UTC(year, month, 1) - BANGKOK_OFFSET_MS),
    };
  });
}

/** เติมเดือนที่ไม่มีข้อมูลเป็น 0 — กราฟต้องมีครบทุกเดือน */
export function fillMonths(
  months: readonly { key: string; label: string }[],
  counts: ReadonlyMap<string, number>,
): { key: string; label: string; count: number }[] {
  return months.map((m) => ({ key: m.key, label: m.label, count: counts.get(m.key) ?? 0 }));
}

// ───────────── ตัวกรองรายงาน (/admin/reports) ─────────────

export const REPORT_VIEWS = ["course", "learner", "sales"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];
export const REPORT_PAGE_SIZE = 50;
/** เพดานแถวของไฟล์ส่งออก — กันคำขอเดียวดึงทั้งฐานข้อมูล */
export const REPORT_EXPORT_MAX = 10_000;

export type ReportParams = {
  view: ReportView;
  departmentId: string | null;
  courseId: string | null;
  /** "YYYY-MM-DD" ตามเวลาไทย (รวมทั้งวัน) */
  from: string | null;
  to: string | null;
  page: number;
};

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.cuid();

/** อ่านตัวกรองจาก URL/ฟอร์มแบบไม่เชื่อค่า — ค่าผิดรูปถูกทิ้ง */
export function parseReportParams(input: Record<string, string | string[] | undefined | null>): ReportParams {
  const one = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : (v ?? undefined));
  const pick = (v: string | undefined, schema: z.ZodType<string>) => (v && schema.safeParse(v).success ? v : null);
  const page = Number.parseInt(one(input.page) ?? "1", 10);
  let from = pick(one(input.from), dateText);
  let to = pick(one(input.to), dateText);
  if (from && Number.isNaN(Date.parse(from))) from = null;
  if (to && Number.isNaN(Date.parse(to))) to = null;
  if (from && to && from > to) [from, to] = [to, from];
  return {
    view: (REPORT_VIEWS as readonly string[]).includes(one(input.view) ?? "") ? (one(input.view) as ReportView) : "course",
    departmentId: pick(one(input.department), id),
    courseId: pick(one(input.course), id),
    from,
    to,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** ช่วงวันที่ไทย → ช่วงเวลา UTC สำหรับ query (`to` รวมทั้งวัน = น้อยกว่าเที่ยงคืนของวันถัดไป) */
export function reportDateRange(params: Pick<ReportParams, "from" | "to">): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (params.from) range.gte = new Date(`${params.from}T00:00:00+07:00`);
  if (params.to) range.lt = new Date(new Date(`${params.to}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000);
  return range;
}

/** query string ของตัวกรอง (ไม่รวมหน้า) — ใช้กับลิงก์แบ่งหน้าและปุ่มสลับมุมมอง */
export function reportQuery(params: ReportParams, override: Partial<ReportParams> = {}): Record<string, string> {
  const p = { ...params, ...override };
  return {
    view: p.view,
    ...(p.departmentId ? { department: p.departmentId } : {}),
    ...(p.courseId ? { course: p.courseId } : {}),
    ...(p.from ? { from: p.from } : {}),
    ...(p.to ? { to: p.to } : {}),
  };
}

// ───────────── ตารางส่งออก ─────────────

/**
 * กันสูตรในสเปรดชีต (CSV/Formula injection) — ข้อความที่ผู้ใช้กรอกเองขึ้นต้นด้วย = + - @ tab
 * จะถูก Excel ตีความเป็นสูตร · เติม ' นำหน้าเฉพาะข้อความ ตัวเลขส่งเป็นตัวเลขตามเดิม
 */
export function spreadsheetSafe(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const isoDate = (d: Date | null) => (d ? new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) : "");

export type CourseReportRow = {
  title: string;
  departmentName: string | null;
  enrolled: number;
  active: number;
  completed: number;
  avgProgress: number | null;
};

export const COURSE_REPORT_HEADER = [
  "คอร์ส",
  "คณะ",
  "ผู้เรียน (ไม่รวมรออนุมัติ/ถอน)",
  "กำลังเรียน",
  "เรียนจบ",
  "อัตราการเรียนจบ (%)",
  "ความคืบหน้าเฉลี่ย (%)",
];

export function courseReportTable(rows: readonly CourseReportRow[]): (string | number)[][] {
  return [
    COURSE_REPORT_HEADER,
    ...rows.map((r) => [
      spreadsheetSafe(r.title),
      spreadsheetSafe(r.departmentName ?? ""),
      r.enrolled,
      r.active,
      r.completed,
      completionRate(r.completed, r.enrolled) ?? "",
      r.avgProgress ?? "",
    ]),
  ];
}

export type LearnerReportRow = {
  externalId: string | null;
  name: string;
  email: string;
  courseTitle: string;
  status: EnrollmentStatus;
  expired: boolean;
  progressPct: number;
  enrolledAt: Date;
  completedAt: Date | null;
};

export const LEARNER_REPORT_HEADER = [
  "รหัส",
  "ชื่อ",
  "อีเมล",
  "คอร์ส",
  "สถานะ",
  "ความคืบหน้า (%)",
  "วันที่ลงทะเบียน",
  "วันที่เรียนจบ",
];

/** สถานะที่ผู้ใช้เห็นจริง — ACTIVE ที่เลยวันหมดอายุแสดงเป็น "หมดอายุ" (ไม่มีงานเปลี่ยนสถานะอัตโนมัติ) */
export function learnerStatusLabel(row: Pick<LearnerReportRow, "status" | "expired">): string {
  if (row.expired && row.status === EnrollmentStatus.ACTIVE) return ENROLLMENT_STATUS_LABEL[EnrollmentStatus.EXPIRED];
  return ENROLLMENT_STATUS_LABEL[row.status];
}

export function learnerReportTable(rows: readonly LearnerReportRow[], withCourse = true): (string | number)[][] {
  const header = withCourse ? LEARNER_REPORT_HEADER : LEARNER_REPORT_HEADER.filter((h) => h !== "คอร์ส");
  return [
    header,
    ...rows.map((r) => {
      const cells: (string | number)[] = [
        spreadsheetSafe(r.externalId ?? ""),
        spreadsheetSafe(r.name),
        spreadsheetSafe(r.email),
        spreadsheetSafe(r.courseTitle),
        learnerStatusLabel(r),
        r.progressPct,
        isoDate(r.enrolledAt),
        isoDate(r.completedAt),
      ];
      if (!withCourse) cells.splice(3, 1);
      return cells;
    }),
  ];
}

// ───────────── ยอดขาย (M18 · phase-4-plan ขั้น 6) ─────────────

/**
 * ยอดขายต่อคอร์สจาก SQL (จำนวนเงินเป็นสตริงบาท) · นับเฉพาะคำสั่งซื้อที่เคยชำระ (PAID + REFUNDED) ตามวันที่ชำระ
 * ยอดขาย = ยอดที่เก็บจริง (หลังส่วนลด) · สุทธิ = ยอดขาย − คืนเงิน
 */
export type SalesReportRow = {
  title: string;
  departmentName: string | null;
  orders: number;
  gross: string;
  discount: string;
  coupons: number;
  refunds: number;
  refunded: string;
};

/** สุทธิหลังคืนเงิน — คิดเป็นสตางค์ (ไม่ผ่าน float) */
export function netSales(row: Pick<SalesReportRow, "gross" | "refunded">): string {
  return fromSatang(Math.max(0, toSatang(row.gross) - toSatang(row.refunded)));
}

/** รวมหลายแถวเป็นยอดเดียว (การ์ดสรุป) */
export function sumSales(rows: readonly SalesReportRow[]): Omit<SalesReportRow, "title" | "departmentName"> {
  const add = (pick: (r: SalesReportRow) => string) => fromSatang(rows.reduce((s, r) => s + toSatang(pick(r)), 0));
  return {
    orders: rows.reduce((s, r) => s + r.orders, 0),
    gross: add((r) => r.gross),
    discount: add((r) => r.discount),
    coupons: rows.reduce((s, r) => s + r.coupons, 0),
    refunds: rows.reduce((s, r) => s + r.refunds, 0),
    refunded: add((r) => r.refunded),
  };
}

export const SALES_REPORT_HEADER = [
  "คอร์ส",
  "คณะ",
  "คำสั่งซื้อที่ชำระ",
  "ยอดขาย (บาท)",
  "ส่วนลด (บาท)",
  "ใช้คูปอง",
  "คืนเงิน (รายการ)",
  "คืนเงิน (บาท)",
  "สุทธิ (บาท)",
];

export function salesReportTable(rows: readonly SalesReportRow[]): (string | number)[][] {
  return [
    SALES_REPORT_HEADER,
    ...rows.map((r) => [
      spreadsheetSafe(r.title),
      spreadsheetSafe(r.departmentName ?? ""),
      r.orders,
      Number(r.gross),
      Number(r.discount),
      r.coupons,
      r.refunds,
      Number(r.refunded),
      Number(netSales(r)),
    ]),
  ];
}

/** เติมเดือนที่ไม่มียอดขายเป็น 0 (ตารางรายเดือน 12 เดือน) */
export function fillSalesMonths(
  months: readonly { key: string; label: string }[],
  rows: readonly { month: string; orders: number; gross: string; refunded: string }[],
): { key: string; label: string; orders: number; gross: string; refunded: string; net: string }[] {
  return months.map((m) => {
    const r = rows.find((x) => x.month === m.key);
    const gross = r?.gross ?? "0.00";
    const refunded = r?.refunded ?? "0.00";
    return { key: m.key, label: m.label, orders: r?.orders ?? 0, gross, refunded, net: netSales({ gross, refunded }) };
  });
}
