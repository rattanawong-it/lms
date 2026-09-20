import { expect, test, type Page } from "@playwright/test";
import { ANONYMOUS, STATE_FILE } from "./constants";

/**
 * M04 — Course Builder
 * เดินเส้นทางจริง: ผู้สอนสร้างคอร์ส → เพิ่มบท/บทเรียน → ส่งตรวจ → ผู้ดูแลอนุมัติ → คอร์สขึ้นคลัง
 *
 * ใช้ slug ไม่ซ้ำต่อรอบ เพราะเทสต์เขียนลงฐานข้อมูลจริงและรันซ้ำได้
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `e2e-course-${RUN_ID}`;
const TITLE = `คอร์สทดสอบอัตโนมัติ ${RUN_ID}`;

/** เทสต์ในไฟล์นี้ต้องทำต่อกันเป็นลำดับ เพราะเป็นเส้นทางเดียวที่ไหลต่อเนื่อง */
test.describe.configure({ mode: "serial" });

async function gotoCourseSettings(page: Page) {
  await page.goto("/teach");
  await page.getByRole("link", { name: TITLE }).click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
}

test.describe("ผู้สอนสร้างและจัดการคอร์ส", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์สแล้วถูกพาไปหน้าจัดสารบัญ (FR-04.1)", async ({ page }) => {
    await page.goto("/teach/courses/new");

    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(TITLE);
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(SLUG);
    await page
      .getByLabel("คำโปรย (ไม่บังคับ)", { exact: true })
      .fill("คอร์สที่สร้างโดยชุดทดสอบอัตโนมัติ");
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();

    await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/, { timeout: 30_000 });
    await expect(page.getByText("ยังไม่มีบทในคอร์สนี้")).toBeVisible();
  });

  test("ส่งตรวจไม่ได้ถ้ายังไม่มีบทเรียน (FR-04.6)", async ({ page }) => {
    await gotoCourseSettings(page);

    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("คอร์สยังไม่มีบทเรียน จึงยังส่งตรวจหรือเผยแพร่ไม่ได้")).toBeVisible();
    await expect(page.getByText("ฉบับร่าง", { exact: true })).toBeVisible();
  });

  test("เพิ่มบทและบทเรียนได้ (FR-04.2 · FR-04.3 · FR-04.4)", async ({ page }) => {
    await gotoCourseSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();

    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill("บทที่ 1 ความรู้พื้นฐาน");
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    await expect(page.getByText("บทที่ 1 ความรู้พื้นฐาน")).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill("แนะนำคอร์ส");
    await page
      .getByLabel("ลิงก์วิดีโอ", { exact: true })
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByLabel(/เปิดเป็นบทเรียนตัวอย่าง/).check();
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();

    await expect(page.getByText("แนะนำคอร์ส")).toBeVisible();
    // exact เพราะชื่อผู้สอนในเมนูบัญชีคือ "อาจารย์ตัวอย่าง" ซึ่งชนแบบ substring
    await expect(page.getByText("ตัวอย่าง", { exact: true })).toBeVisible();
  });

  test("ปฏิเสธลิงก์วิดีโอที่ไม่ใช่ YouTube/Vimeo", async ({ page }) => {
    await gotoCourseSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();

    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill("ลิงก์ที่ไม่รองรับ");
    await page.getByLabel("ลิงก์วิดีโอ", { exact: true }).fill("https://evil.example/video.mp4");
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();

    await expect(page.getByText("รองรับเฉพาะลิงก์ YouTube และ Vimeo")).toBeVisible();
  });

  test("ส่งคอร์สให้คณะอนุมัติได้เมื่อมีบทเรียนแล้ว (FR-04.6)", async ({ page }) => {
    await gotoCourseSettings(page);

    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("รอคณะอนุมัติ", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("ผู้สอนอนุมัติคอร์สของตัวเองไม่ได้ (§4.1)", async ({ page }) => {
    await gotoCourseSettings(page);
    await expect(page.getByRole("button", { name: "อนุมัติและเผยแพร่" })).toHaveCount(0);
    await expect(page.getByText("การเปลี่ยนสถานะขั้นถัดไปต้องให้ผู้ดูแลคณะเป็นผู้ทำ")).toBeVisible();
  });
});

test.describe("ผู้ดูแลอนุมัติคอร์ส", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("คอร์สปรากฏในคิวรออนุมัติแล้วอนุมัติได้ (FR-04.6)", async ({ page }) => {
    await page.goto("/admin/courses");
    await expect(page.getByText(TITLE)).toBeVisible();

    await page
      .getByRole("row", { name: new RegExp(TITLE) })
      .getByRole("link", { name: "ตรวจคอร์ส" })
      .click();

    await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "อนุมัติและเผยแพร่" }).click();
    await expect(page.getByText("เผยแพร่แล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("คอร์สที่เผยแพร่แล้ว", () => {
  test("ผู้เรียนเห็นในคลังคอร์สและเปิดหน้ารายละเอียดได้", async ({ page }) => {
    const response = await page.goto(`/courses/${SLUG}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    await expect(page.getByText("บทที่ 1 ความรู้พื้นฐาน")).toBeVisible();
  });

  test("ผู้เรียนแก้ไขคอร์สของผู้อื่นไม่ได้", async ({ page }) => {
    const response = await page.goto("/teach");
    expect(response?.status()).toBe(403);
  });
});

test.describe("ผู้เยี่ยมชมที่ยังไม่ล็อกอิน", () => {
  test.use({ storageState: ANONYMOUS });

  test("ไม่เห็นคอร์สภายในที่เพิ่งเผยแพร่", async ({ page }) => {
    // คอร์สที่สร้างใช้ค่าตั้งต้น INTERNAL จึงต้องไม่หลุดไปถึงคนนอก
    const response = await page.goto(`/courses/${SLUG}`);
    expect(response?.status()).toBe(404);
  });
});
