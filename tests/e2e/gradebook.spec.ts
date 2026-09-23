import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";

/**
 * M09 — สมุดคะแนน (FR-09.1–09.5)
 *
 * เส้นทาง: ผู้สอนสร้างงาน → ผู้เรียนส่ง → ผู้สอนให้ 8/10 → งานเข้าสมุดคะแนนเอง (FR-09.1)
 * → เพิ่มรายการกรอกเอง + ตั้งน้ำหนัก 60/40 (FR-09.2) → กรอก/แก้ทับในตาราง (FR-09.3)
 * → ส่งออก CSV (FR-09.5) → ผู้เรียนเห็นเฉพาะของตัวเอง (FR-09.4) → กลับไปใช้คะแนนอัตโนมัติ
 * แต่ละ project ใช้คอร์สของตัวเอง · จอมือถือเป็นการ์ด จอกว้างเป็นตาราง — ใช้ช่องที่มองเห็นเท่านั้น
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สสมุดคะแนน ${p} ${RUN_ID}`;
const slug = (p: string) => `e2e-gradebook-${p}-${RUN_ID}`;
const ASSIGNMENT = "รายงานกลุ่ม";
const MANUAL = "เข้าเรียน";
const LESSON = "ส่งรายงานกลุ่ม";

test.describe.configure({ mode: "serial" });

async function openCourse(page: Page, project: string) {
  await page.goto("/teach");
  await page.getByRole("link", { name: courseTitle(project) }).first().click();
  await expect(page.getByRole("heading", { name: courseTitle(project), level: 1 })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}

async function openGradebook(page: Page, project: string) {
  const coursePath = await openCourse(page, project);
  await page.goto(`${coursePath}/gradebook`);
  await expect(page.getByRole("heading", { name: "สมุดคะแนน", level: 1 })).toBeVisible({ timeout: 30_000 });
  return coursePath;
}

/** ช่องคะแนนที่มองเห็น (ตารางบนจอกว้าง / การ์ดบนมือถือ มีอย่างละชุด) */
const cell = (page: Page, item: string) =>
  page.getByLabel(new RegExp(`^คะแนน ${item} ของ `)).filter({ visible: true }).first();
const total = (page: Page) => page.locator("[data-total]").filter({ visible: true }).first();

async function fillCell(page: Page, item: string, value: string) {
  await cell(page, item).fill(value);
  await cell(page, item).press("Enter");
  await expect(page.getByText("บันทึกคะแนนแล้ว").first()).toBeVisible({ timeout: 15_000 });
}

test.describe("เตรียมคอร์สที่มีงาน", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ผู้สอนสร้างคอร์ส บทงาน และงานเต็ม 10", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/teach/courses/new");
    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(courseTitle(p));
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(slug(p));
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();
    await expect(page).toHaveURL(/\/curriculum/, { timeout: 30_000 });
    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill("บทที่ 1");
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    await expect(page.getByRole("heading", { name: /บทที่ 1/ })).toBeVisible();
    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill(LESSON);
    await page.getByLabel("ชนิดบทเรียน").click();
    await page.getByRole("option", { name: "งานที่ต้องส่ง" }).click();
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText(LESSON, { exact: true })).toBeVisible({ timeout: 15_000 });

    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/assignments/new`);
    await page.getByLabel("ชื่องาน", { exact: true }).fill(ASSIGNMENT);
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: LESSON }).click();
    const editor = page.locator('[contenteditable="true"][aria-label="คำสั่งงาน"]');
    await editor.click();
    await editor.pressSequentially("ส่งรายงานเป็นข้อความ");
    await page.getByLabel("คะแนนเต็ม").fill("10");
    await page.getByRole("button", { name: "สร้างงาน" }).click();
    await expect(page.getByText("สร้างงานแล้ว")).toBeVisible({ timeout: 15_000 });

    await page.goto(coursePath);
    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("รอคณะอนุมัติ", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้ดูแล", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("อนุมัติคอร์ส", async ({ page }, info) => {
    await page.goto("/admin/courses");
    await page
      .getByRole("row", { name: new RegExp(courseTitle(info.project.name)) })
      .getByRole("link", { name: "ตรวจคอร์ส" })
      .click();
    await page.getByRole("button", { name: "อนุมัติและเผยแพร่" }).click();
    await expect(page.getByText("เผยแพร่แล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("สมุดคะแนน", () => {
  test("ผู้เรียนลงทะเบียนและส่งงาน · ยังไม่มีคะแนนรวม", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/courses/${slug(p)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: /เรียนต่อ/ }).click();
    await expect(page.getByRole("heading", { name: LESSON, level: 1 })).toBeVisible({ timeout: 30_000 });
    const form = page.getByRole("form", { name: "ส่งงาน" });
    await form.getByLabel("คำตอบ / ข้อความถึงผู้สอน").fill("รายงานของกลุ่ม");
    await form.getByRole("button", { name: "ส่งงาน" }).click();
    await expect(page.getByText("ส่งงานแล้ว", { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("ผู้สอนตรวจงาน → คะแนนเข้าสมุดเอง (FR-09.1) · เพิ่มรายการกรอกเองและตั้งน้ำหนัก (FR-09.2)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();

    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/assignments/review`);
    await page.locator("[data-queue-item]").getByRole("link", { name: "ตรวจ" }).click();
    await page.getByLabel("คะแนน (เต็ม 10)").fill("8");
    await page.getByLabel("คะแนน (เต็ม 10)").press("Enter");
    await expect(page.getByText("บันทึกคะแนนและแจ้งผู้เรียนแล้ว")).toBeVisible({ timeout: 15_000 });

    await openGradebook(page, p);
    await expect(cell(page, ASSIGNMENT)).toHaveValue("8");
    await expect(page.getByText(/น้ำหนักรวม 0%/)).toBeVisible();
    await expect(total(page)).toHaveText("–");

    await page.getByRole("link", { name: "รายการ น้ำหนัก และเกณฑ์เกรด" }).click();
    await expect(page.getByRole("heading", { name: "รายการ น้ำหนัก และเกณฑ์เกรด", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("ชื่อรายการ").fill(MANUAL);
    await page.getByLabel("คะแนนเต็ม").fill("10");
    await page.getByRole("button", { name: "เพิ่มรายการ" }).click();
    await expect(page.getByText("เพิ่มรายการคะแนนแล้ว — อย่าลืมกำหนดน้ำหนัก")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-grade-item]")).toHaveCount(2);

    await page.getByLabel(`น้ำหนัก ${ASSIGNMENT} (%)`).fill("60");
    await page.getByLabel(`น้ำหนัก ${MANUAL} (%)`).fill("40");
    await expect(page.locator("[data-weight-total]")).toHaveText("รวม 100%");
    await page.getByRole("button", { name: "บันทึกน้ำหนัก" }).click();
    await expect(page.getByText("บันทึกน้ำหนักแล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("กรอกและแก้ทับคะแนนในตาราง (FR-09.3) · ส่งออก CSV (FR-09.5)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();
    await openGradebook(page, p);

    // 8/10×60 + 9/10×40 = 48 + 36 = 84 → A
    await fillCell(page, MANUAL, "9");
    await expect(total(page)).toHaveText(/^84\s*A$/, { timeout: 15_000 });

    // แก้ทับคะแนนงาน 8 → 7: 42 + 36 = 78 → B+ และมีปุ่มกลับไปใช้คะแนนอัตโนมัติ
    await fillCell(page, ASSIGNMENT, "7");
    await expect(total(page)).toHaveText(/^78\s*B\+$/, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: new RegExp(`^กลับไปใช้คะแนนอัตโนมัติ: คะแนน ${ASSIGNMENT}`) }).filter({ visible: true }),
    ).toHaveCount(1);

    // เกินคะแนนเต็มไม่ถูกบันทึก
    await cell(page, MANUAL).fill("11");
    await cell(page, MANUAL).press("Enter");
    await expect(page.getByText("รายการนี้เต็ม 10 คะแนน").first()).toBeVisible({ timeout: 15_000 });
    await expect(cell(page, MANUAL)).toHaveValue("9");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "ส่งออก CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^สมุดคะแนน .*\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    const text = Buffer.concat(csv).toString("utf-8");
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain(`${ASSIGNMENT} (เต็ม 10 · 60%)`);
    expect(text).toContain(",78,B+");
    await context.close();
  });

  test("ผู้เรียนเห็นเฉพาะคะแนนของตัวเอง (FR-09.4) · เปิดสมุดคะแนนของผู้สอนไม่ได้", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/courses/${slug(p)}`);
    await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
    // มือถือ: สารบัญ (ที่มีลิงก์คะแนน) อยู่ใน drawer
    if (info.project.name === "mobile") await page.getByRole("button", { name: /สารบัญบทเรียน/ }).click();
    await page.getByRole("link", { name: "คะแนนของฉัน" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("heading", { name: "คะแนนของฉัน", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-my-total]")).toHaveText("78");
    await expect(page.locator("[data-my-grade]")).toHaveText("B+");
    await expect(page.locator("[data-my-grade-item]")).toHaveCount(2);
    // หน้าของผู้เรียนไม่มีช่องแก้คะแนนของใครเลย
    await expect(page.locator("[data-grade-cell]")).toHaveCount(0);
  });

  test("กลับไปใช้คะแนนอัตโนมัติ → กลับเป็น 8 (84 · A)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();
    const coursePath = await openGradebook(page, p);
    await page
      .getByRole("button", { name: new RegExp(`^กลับไปใช้คะแนนอัตโนมัติ: คะแนน ${ASSIGNMENT}`) })
      .filter({ visible: true })
      .click();
    await expect(page.getByText("กลับไปใช้คะแนนอัตโนมัติแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await expect(cell(page, ASSIGNMENT)).toHaveValue("8");
    await expect(total(page)).toHaveText(/^84\s*A$/);
    await context.close();

    const student = await browser.newContext({ storageState: STATE_FILE.student });
    const response = await (await student.newPage()).goto(`${coursePath}/gradebook`);
    expect(response?.status()).toBe(403);
    await student.close();
  });
});
