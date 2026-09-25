import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture, teachSearch } from "./helpers";
import type { ReportsFixture } from "./support/reports-fixture";

/**
 * M16 · FR-16.1–16.4 — แดชบอร์ดและรายงาน (phase-3-plan ขั้น 6)
 * แต่ละบทบาทเห็นตัวเลขของตัวเอง · ผู้ดูแลคณะมองไม่เห็นคอร์สคณะอื่น · ส่งออกไฟล์ได้ (ตรวจหัวคอลัมน์)
 * ข้อมูลเตรียมตรงใน DB (support/reports-fixture.ts) · แยกคอร์สต่อ project
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const titleA = (p: string) => `คอร์สรายงาน A ${p} ${RUN_ID}`;
const titleB = (p: string) => `คอร์สรายงาน B ${p} ${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, ReportsFixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("reports-fixture.ts", "cleanup", f);
});

/** กดปุ่มส่งออกแล้วคืนเนื้อไฟล์ที่ดาวน์โหลดได้ */
async function download(page: Page, button: string): Promise<{ name: string; body: Buffer }> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
  return { name: file.suggestedFilename(), body: await readFile((await file.path())!) };
}

test("เตรียมคอร์ส", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<ReportsFixture>("reports-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      titleA: titleA(p),
      titleB: titleB(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
      deptAdminEmail: ACCOUNTS.deptAdmin.email,
    }),
  );
});

test.describe("ผู้เรียน (FR-16.1)", () => {
  test.use({ storageState: STATE_FILE.student });

  test("หน้าหลักแสดงคอร์สที่กำลังเรียนพร้อมเรียนต่อ และคาบเรียนสด 7 วัน", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto("/dashboard");
    const course = page.locator("[data-dashboard-course]").filter({ hasText: titleA(p) });
    await expect(course).toBeVisible({ timeout: 30_000 });
    await expect(course.getByRole("link", { name: /เรียนต่อ/ })).toHaveAttribute("href", `/learn/${f.courseA}`);
    await expect(page.locator("[data-dashboard-live]").filter({ hasText: f.liveTitle })).toBeVisible();
  });
});

test.describe("ผู้สอน (FR-16.2, FR-16.4)", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ตัวเลขต่อคอร์ส: % จบ · รอตรวจ · คำถามรอตอบ", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(teachSearch(titleA(p)));
    const row = page.getByRole("row").filter({ hasText: titleA(p) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator("[data-completion]")).toHaveText("33.3%");
    await expect(row.getByRole("link", { name: /รอตรวจ 1 งาน/ })).toHaveText("1");
    await expect(row.getByRole("link", { name: "1", exact: true })).toHaveAttribute("href", /\/qa$/);
  });

  test("ส่งออกความคืบหน้าของคอร์สเป็น CSV (ไม่มีคอลัมน์คอร์ส)", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/teach/courses/${f.courseA}/students`);
    const csv = await download(page, "ส่งออก CSV");
    expect(csv.name).toMatch(/\.csv$/);
    const lines = csv.body.toString("utf8").replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("รหัส,ชื่อ,อีเมล,สถานะ,ความคืบหน้า (%),วันที่ลงทะเบียน,วันที่เรียนจบ");
    expect(lines.filter((l) => l.includes(`report-done-${info.project.name}-${RUN_ID}`))[0]).toContain("เรียนจบแล้ว,100");
  });
});

test.describe("ผู้ดูแลคณะ (FR-16.3, FR-16.4)", () => {
  test.use({ storageState: STATE_FILE.deptAdmin });

  test("รายงานรายคอร์ส + ส่งออก Excel · มองไม่เห็นคอร์สของคณะอื่น", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto(`/admin/reports?view=course&course=${f.courseA}`);
    const row = page.locator("[data-report-row]").filter({ hasText: titleA(p) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator("td").nth(1)).toHaveText("3");
    await expect(row.locator("td").nth(4)).toHaveText("33.3%");

    const xlsx = await download(page, "ส่งออก Excel");
    expect(xlsx.name).toMatch(/\.xlsx$/);
    expect(xlsx.body.subarray(0, 2).toString()).toBe("PK");

    // ส่ง department/course ของคณะอื่นมาทาง URL ก็ไม่เห็น — ขอบเขตบังคับใน query
    await page.goto(`/admin/reports?view=learner&course=${f.courseB}`);
    await expect(page.locator("[data-report-total]")).toHaveText(/พบ 0 /, { timeout: 30_000 });
    await expect(page.getByText(titleB(p))).toHaveCount(0);
  });

  test("แดชบอร์ดเห็นเฉพาะคณะตัวเอง", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("เฉพาะคณะที่คุณดูแล").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-department-row]")).toHaveCount(1);
  });
});

test.describe("ผู้ดูแลระบบ (FR-16.3, FR-16.4)", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("แดชบอร์ดแยกตามคณะ + กราฟ · รายงานรายผู้เรียนส่งออก CSV", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto("/admin");
    await expect(page.getByText("การลงทะเบียน 12 เดือนล่าสุด")).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("[data-department-row]").count()).toBeGreaterThan(1);

    await page.goto(`/admin/reports?view=learner&course=${f.courseB}`);
    await expect(page.locator("[data-report-row]")).toHaveCount(1, { timeout: 30_000 });
    const csv = await download(page, "ส่งออก CSV");
    const [header, first] = csv.body.toString("utf8").replace(/^﻿/, "").split("\r\n");
    expect(header).toBe("รหัส,ชื่อ,อีเมล,คอร์ส,สถานะ,ความคืบหน้า (%),วันที่ลงทะเบียน,วันที่เรียนจบ");
    expect(first).toContain(titleB(p));
  });

  test("รายงานเหตุการณ์หน้าจอกรองได้", async ({ page }) => {
    await page.goto(`/admin/screen-events?q=${encodeURIComponent(`ไม่มีผู้ใช้นี้ ${RUN_ID}`)}`);
    await expect(page.getByText("ไม่พบเหตุการณ์ตามตัวกรองนี้")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "ล้าง" })).toBeVisible();
  });
});
