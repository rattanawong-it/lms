import { describe, expect, it } from "vitest";
import { EnrollmentStatus, ScreenEvent } from "@/generated/prisma/enums";
import {
  COURSE_REPORT_HEADER,
  LEARNER_REPORT_HEADER,
  completionRate,
  courseReportTable,
  fillMonths,
  formatRate,
  lastMonths,
  learnerReportTable,
  parseReportParams,
  reportDateRange,
  spreadsheetSafe,
} from "@/features/reports/lib/report";
import { parseScreenEventFilter } from "@/features/protection/schemas";

/** M16 · FR-16.1–16.4 — สูตรรายงานและไฟล์ส่งออก */

describe("อัตราการเรียนจบ", () => {
  it("เป็น % ทศนิยม 1 ตำแหน่ง · ไม่มีผู้เรียน = null", () => {
    expect(completionRate(1, 3)).toBe(33.3);
    expect(completionRate(2, 3)).toBe(66.7);
    expect(completionRate(5, 5)).toBe(100);
    expect(completionRate(0, 0)).toBeNull();
    expect(completionRate(7, 5)).toBe(100);
    expect(formatRate(null)).toBe("–");
    expect(formatRate(66.7)).toBe("66.7%");
  });
});

describe("เดือนย้อนหลัง (เวลาไทย)", () => {
  it("12 เดือนรวมเดือนนี้ เรียงเก่า → ใหม่ · ตัดเดือนตามเวลาไทย", () => {
    // 30 ก.ย. 2569 เวลา 20:00 UTC = 1 ต.ค. 03:00 น. ไทย → เดือนนี้คือ ต.ค.
    const months = lastMonths(new Date("2026-09-30T20:00:00Z"), 12);
    expect(months).toHaveLength(12);
    expect(months[11]).toMatchObject({ key: "2026-10", label: "ต.ค. 69" });
    expect(months[0]).toMatchObject({ key: "2025-11", label: "พ.ย. 68" });
    expect(months[11]!.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("เติมเดือนที่ไม่มีข้อมูลเป็น 0", () => {
    const months = lastMonths(new Date("2026-03-15T00:00:00Z"), 3);
    expect(fillMonths(months, new Map([["2026-02", 4]])).map((m) => m.count)).toEqual([0, 4, 0]);
  });
});

describe("ตัวกรองรายงาน", () => {
  it("ค่าผิดรูปถูกทิ้ง · สลับช่วงวันที่ที่กลับหัว", () => {
    expect(parseReportParams({ view: "evil", department: "x", course: "1", from: "2026-13-40", page: "0" })).toEqual({
      view: "course",
      departmentId: null,
      courseId: null,
      from: null,
      to: null,
      page: 1,
    });
    expect(parseReportParams({ view: "learner", from: "2026-09-30", to: "2026-09-01" })).toMatchObject({
      view: "learner",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("วันที่ไทยแปลงเป็นช่วง UTC — วันสุดท้ายรวมทั้งวัน", () => {
    expect(reportDateRange({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      gte: new Date("2026-08-31T17:00:00.000Z"),
      lt: new Date("2026-09-30T17:00:00.000Z"),
    });
    expect(reportDateRange({ from: null, to: null })).toEqual({});
  });
});

describe("ไฟล์ส่งออก", () => {
  it("หัวคอลัมน์รายคอร์ส + อัตราการเรียนจบ", () => {
    const table = courseReportTable([
      { title: "คอร์ส ก", departmentName: "วิทย์", enrolled: 3, active: 2, completed: 1, avgProgress: 55.5 },
    ]);
    expect(table[0]).toEqual(COURSE_REPORT_HEADER);
    expect(table[1]).toEqual(["คอร์ส ก", "วิทย์", 3, 2, 1, 33.3, 55.5]);
  });

  it("รายผู้เรียน: สถานะที่เห็นจริง (หมดอายุ) · วันที่เวลาไทย · ไม่มีคอลัมน์คอร์สเมื่อส่งออกจากหน้าคอร์ส", () => {
    const row = {
      externalId: "6400001",
      name: "สมชาย ใจดี",
      email: "s@krirk.ac.th",
      courseTitle: "คอร์ส ก",
      status: EnrollmentStatus.ACTIVE,
      expired: true,
      progressPct: 40,
      enrolledAt: new Date("2026-09-24T18:00:00Z"),
      completedAt: null,
    };
    const table = learnerReportTable([row]);
    expect(table[0]).toEqual(LEARNER_REPORT_HEADER);
    expect(table[1]).toEqual(["6400001", "สมชาย ใจดี", "s@krirk.ac.th", "คอร์ส ก", "หมดอายุ", 40, "2026-09-25", ""]);
    const course = learnerReportTable([row], false);
    expect(course[0]).not.toContain("คอร์ส");
    expect(course[1]).toHaveLength(7);
  });

  it("กันสูตรในสเปรดชีต (CSV injection)", () => {
    expect(spreadsheetSafe("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(spreadsheetSafe("+66")).toBe("'+66");
    expect(spreadsheetSafe("@me")).toBe("'@me");
    expect(spreadsheetSafe(-5)).toBe(-5);
    expect(spreadsheetSafe("ปกติ")).toBe("ปกติ");
    const table = learnerReportTable([
      {
        externalId: null,
        name: "=cmd|' /C calc'!A0",
        email: "x@y.z",
        courseTitle: "c",
        status: EnrollmentStatus.COMPLETED,
        expired: false,
        progressPct: 100,
        enrolledAt: new Date(),
        completedAt: null,
      },
    ]);
    expect(String(table[1]![1]).startsWith("'=")).toBe(true);
  });
});

describe("ตัวกรองเหตุการณ์หน้าจอ", () => {
  it("รับเฉพาะชนิดที่มีจริงและวันที่ถูกรูป", () => {
    expect(parseScreenEventFilter({ q: "  somchai ", event: "PRINTSCREEN", from: "2026-09-01", page: "2" })).toEqual({
      q: "somchai",
      event: ScreenEvent.PRINTSCREEN,
      from: "2026-09-01",
      to: null,
      page: 2,
    });
    expect(parseScreenEventFilter({ event: "DROP TABLE", to: "yesterday" })).toMatchObject({ event: null, to: null, page: 1 });
  });
});
