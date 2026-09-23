import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { STATE_FILE } from "./constants";

/**
 * M07 ขั้น 1 — คลังข้อสอบ (FR-07.1 / FR-07.2 / FR-07.7)
 *
 * desktop กับ mobile ใช้บัญชีผู้สอนเดียวกันและเขียนคอร์สเดียวกันพร้อมกัน
 * ข้อสอบของแต่ละ project จึงติดแท็กไม่ซ้ำ แล้วกรองหน้าด้วยแท็กนั้นเสมอ
 */
const COURSE_TITLE = "เริ่มต้นใช้งาน KRIRK LMS";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tagOf = (project: string) => `e2e-${project}-${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.use({ storageState: STATE_FILE.instructor });

let bankPath = "";

async function openBank(page: Page, tag: string, archived = false) {
  if (!bankPath) {
    await page.goto("/teach");
    await page.getByRole("link", { name: COURSE_TITLE }).first().click();
    await expect(page.getByRole("heading", { name: COURSE_TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
    bankPath = `${new URL(page.url()).pathname}/questions`;
  }
  const params = new URLSearchParams({ tag, ...(archived ? { archived: "1" } : {}) });
  await page.goto(`${bankPath}?${params}`);
  await expect(page.getByRole("heading", { name: "คลังข้อสอบ", level: 1 })).toBeVisible({ timeout: 30_000 });
}

async function fillPrompt(page: Page, text: string) {
  const editor = page.locator('[contenteditable="true"][aria-label="โจทย์"]');
  await editor.click();
  await editor.pressSequentially(text);
}

async function chooseType(page: Page, label: string) {
  await page.getByRole("dialog").getByLabel("ชนิดข้อสอบ").click();
  await page.getByRole("option", { name: label }).click();
}

test("สร้างข้อปรนัยตอบเดียวแล้วเห็นในคลังพร้อมเฉลย (FR-07.2)", async ({ page }, info) => {
  const tag = tagOf(info.project.name);
  await openBank(page, tag);

  await page.getByRole("button", { name: "เพิ่มข้อสอบ" }).click();
  const dialog = page.getByRole("dialog");
  await fillPrompt(page, "ข้อใดเป็นภาษาสำหรับจัดรูปแบบหน้าเว็บ");
  await dialog.getByLabel("ตัวเลือกที่ 1", { exact: true }).fill("HTML");
  await dialog.getByLabel("ตัวเลือกที่ 2", { exact: true }).fill("CSS");
  await dialog.getByLabel("ตัวเลือกที่ 3", { exact: true }).fill("SQL");
  await dialog.getByLabel("ลบตัวเลือกที่ 4").click();

  // ยังไม่เลือกคำตอบที่ถูก → ได้ข้อความภาษาไทยจาก server
  await dialog.getByLabel(/^แท็ก/).fill(tag);
  await dialog.getByRole("button", { name: "เพิ่มเข้าคลัง" }).click();
  await expect(dialog.getByText("ข้อปรนัยตอบเดียวต้องเลือกคำตอบที่ถูก 1 ตัว")).toBeVisible({ timeout: 15_000 });

  await dialog.getByLabel("ตัวเลือกที่ 2 เป็นคำตอบที่ถูก").check();
  await dialog.getByRole("button", { name: "เพิ่มเข้าคลัง" }).click();
  await expect(page.getByText("เพิ่มข้อสอบเข้าคลังแล้ว")).toBeVisible({ timeout: 15_000 });

  const card = page.locator("[data-question]").filter({ hasText: "ข้อใดเป็นภาษาสำหรับจัดรูปแบบหน้าเว็บ" });
  await expect(card).toBeVisible();
  await expect(card.getByText("ปรนัยตอบเดียว")).toBeVisible();
  await expect(card.getByRole("listitem").filter({ has: page.getByLabel("คำตอบที่ถูก") })).toHaveText("CSS");
});

test("สร้างข้อจับคู่และข้ออัตนัย (FR-07.2)", async ({ page }, info) => {
  const tag = tagOf(info.project.name);
  await openBank(page, tag);

  await page.getByRole("button", { name: "เพิ่มข้อสอบ" }).click();
  let dialog = page.getByRole("dialog");
  await chooseType(page, "จับคู่");
  await fillPrompt(page, "จับคู่ภาษากับหน้าที่");
  await dialog.getByLabel("ฝั่งซ้ายคู่ที่ 1").fill("HTML");
  await dialog.getByLabel("ฝั่งขวาคู่ที่ 1").fill("โครงสร้าง");
  await dialog.getByLabel("ฝั่งซ้ายคู่ที่ 2").fill("CSS");
  await dialog.getByLabel("ฝั่งขวาคู่ที่ 2").fill("รูปแบบ");
  await dialog.getByLabel("ลบตัวเลือกที่ 3").click();
  await dialog.getByLabel(/^แท็ก/).fill(tag);
  await dialog.getByRole("button", { name: "เพิ่มเข้าคลัง" }).click();
  await expect(page.getByText("เพิ่มข้อสอบเข้าคลังแล้ว")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "เพิ่มข้อสอบ" }).click();
  dialog = page.getByRole("dialog");
  await chooseType(page, "อัตนัย (ตรวจเอง)");
  await fillPrompt(page, "อธิบายหลักการของ HTTPS");
  await dialog.getByLabel("คะแนน", { exact: true }).fill("5");
  await dialog.getByLabel(/^แท็ก/).fill(tag);
  await dialog.getByRole("button", { name: "เพิ่มเข้าคลัง" }).click();
  await expect(page.getByText("เพิ่มข้อสอบเข้าคลังแล้ว").first()).toBeVisible({ timeout: 15_000 });

  await expect(page.locator("[data-question]").filter({ hasText: "HTML → โครงสร้าง" })).toBeVisible();
  await expect(page.locator("[data-question]").filter({ hasText: "อธิบายหลักการของ HTTPS" })).toContainText("5 คะแนน");
});

test("นำเข้า Excel ครบ 6 ชนิด (FR-07.7)", async ({ page }, info) => {
  const tag = tagOf(info.project.name);
  await openBank(page, tag);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ข้อสอบ");
  sheet.addRows([
    ["ชนิด", "โจทย์", "ตัวเลือก", "คำตอบ", "คะแนน", "แท็ก"],
    ["SINGLE", "นำเข้า-ปรนัย", "ก|ข|ค", "1", "1", tag],
    ["MULTIPLE", "นำเข้า-หลายคำตอบ", "ก|ข|ค", "1,3", "2", tag],
    ["TRUE_FALSE", "นำเข้า-ถูกผิด", "", "ผิด", "1", tag],
    ["MATCHING", "นำเข้า-จับคู่", "ก=1|ข=2", "", "2", tag],
    ["SHORT_TEXT", "นำเข้า-เติมคำ", "", "CSS|css3", "1", tag],
    ["ESSAY", "นำเข้า-อัตนัย", "", "", "5", tag],
  ]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
  await page.getByLabel("เลือกไฟล์ข้อสอบ").setInputFiles({
    name: "questions.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.locator("[data-import-row]")).toHaveCount(6, { timeout: 30_000 });
  await page.getByRole("button", { name: "นำเข้า 6 ข้อ" }).click();
  await expect(page.getByText("นำเข้าข้อสอบ 6 ข้อแล้ว")).toBeVisible({ timeout: 30_000 });

  for (const prompt of ["นำเข้า-ปรนัย", "นำเข้า-หลายคำตอบ", "นำเข้า-ถูกผิด", "นำเข้า-จับคู่", "นำเข้า-เติมคำ", "นำเข้า-อัตนัย"]) {
    await expect(page.locator("[data-question]").filter({ hasText: prompt })).toHaveCount(1);
  }
});

test("นำเข้า CSV ที่มีแถวผิดไม่บันทึกอะไรเลย และบอกแถวที่ผิด (FR-07.7)", async ({ page }, info) => {
  const tag = tagOf(info.project.name);
  await openBank(page, tag);
  const before = await page.locator("[data-question]").count();

  const csv = `﻿ชนิด,โจทย์,ตัวเลือก,คำตอบ,แท็ก\nSINGLE,"CSV ข้อดี\nมีสองบรรทัด",ก|ข,2,${tag}\nSINGLE,CSV ข้อเสีย,ก|ข,9,${tag}\n`;
  await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
  await page.getByLabel("เลือกไฟล์ข้อสอบ").setInputFiles({
    name: "questions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });

  const rows = page.locator("[data-import-row]");
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(rows.nth(1)).toContainText("แถว 3");
  await expect(rows.nth(1)).toContainText("คำตอบต้องเป็นลำดับตัวเลือก 1–2");
  await expect(page.getByRole("button", { name: "นำเข้า", exact: true })).toBeDisabled();

  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("[data-question]")).toHaveCount(before);
});

test("แม่แบบ Excel ดาวน์โหลดได้", async ({ page }, info) => {
  await openBank(page, tagOf(info.project.name));
  await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "แม่แบบ Excel (.xlsx)" }).click();
  expect((await download).suggestedFilename()).toBe("แม่แบบนำเข้าข้อสอบ.xlsx");
});

test("แก้ไขข้อสอบ แล้วเก็บเข้าคลังเก่าและนำกลับมาใช้ (S1)", async ({ page }, info) => {
  const tag = tagOf(info.project.name);
  await openBank(page, tag);

  const card = page.locator("[data-question]").filter({ hasText: "อธิบายหลักการของ HTTPS" });
  await card.getByRole("button", { name: "แก้ไข" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("คะแนน", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.getByText("บันทึกการแก้ไขข้อสอบแล้ว")).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("10 คะแนน");

  await card.getByRole("button", { name: "เก็บเข้าคลังเก่า" }).click();
  await expect(page.getByText(/เก็บข้อสอบเข้าคลังเก่าแล้ว/)).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveCount(0);

  await openBank(page, tag, true);
  const archived = page.locator("[data-question]").filter({ hasText: "อธิบายหลักการของ HTTPS" });
  await archived.getByRole("button", { name: "นำกลับมาใช้" }).click();
  await expect(page.getByText("นำข้อสอบกลับมาใช้แล้ว")).toBeVisible({ timeout: 15_000 });
  await expect(archived).toHaveCount(0);
});

test.describe("สิทธิ์", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ผู้เรียนเปิดคลังข้อสอบไม่ได้", async ({ page }) => {
    const target = bankPath || "/teach/courses/unknown/questions";
    const response = await page.goto(target);
    expect(response?.status()).toBe(403);
  });
});
