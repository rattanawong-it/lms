import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";

/**
 * M15 — การป้องกันการคัดลอกเนื้อหา
 *
 * **ไม่แตะสวิตช์ระดับระบบในเทสต์ชุดนี้** เพราะ desktop กับ mobile ใช้ฐานข้อมูลเดียวกัน
 * และรันพร้อมกัน — การปิดสวิตช์ระดับระบบจะทำให้เทสต์ของอีก project เห็นหน้าที่ไม่มีลายน้ำ
 * เส้นทาง "ปิดแล้วไม่ป้องกัน" จึงตรวจที่ฝั่งฟอร์มของผู้สอนแทน (สวิตช์ระดับคอร์ส)
 */
const COURSE_SLUG = "intro-to-lms";
const COURSE_TITLE = "เริ่มต้นใช้งาน KRIRK LMS";
const TEXT_LESSON = "ระบบนี้ใช้ทำอะไรได้บ้าง";

test.describe.configure({ mode: "serial" });

async function openTextLesson(page: Page) {
  await page.goto(`/courses/${COURSE_SLUG}`);

  const enrollButton = page.getByRole("button", { name: "ลงทะเบียนเรียน" });
  if (await enrollButton.isVisible()) {
    await enrollButton.click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({
      timeout: 30_000,
    });
  }

  await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
  await expect(page).toHaveURL(/\/learn\/[a-z0-9]+\/[a-z0-9]+/, { timeout: 30_000 });

  const drawer = page.getByRole("button", { name: /สารบัญบทเรียน/ });
  if (await drawer.isVisible()) await drawer.click();

  await page.getByRole("link", { name: TEXT_LESSON }).click();
  await expect(page.getByRole("heading", { name: TEXT_LESSON, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("ผู้เรียนเปิดบทเรียนที่เปิดการป้องกัน", () => {
  test("ลายน้ำติดชื่อและอีเมลของผู้เรียนคนที่เปิดดู (FR-15.5)", async ({ page }) => {
    await openTextLesson(page);

    const watermark = page.locator("[data-watermark]");
    await expect(watermark).toHaveCount(1);
    await expect(watermark.locator("span").first()).toContainText("student@krirk.ac.th");
    // ต้องไม่บังการกดปุ่มของเนื้อหาที่อยู่ข้างใต้
    await expect(watermark).toHaveCSS("pointer-events", "none");
  });

  test("ลบลายน้ำออกจาก DOM แล้วระบบเอากลับมาเอง (FR-15.5)", async ({ page }) => {
    await openTextLesson(page);
    await expect(page.locator("[data-watermark]")).toHaveCount(1);

    await page.evaluate(() => document.querySelector("[data-watermark]")?.remove());

    await expect(page.locator("[data-watermark]")).toHaveCount(1);
    // และกล่องเนื้อหาต้องไม่พังไปด้วย
    await expect(page.locator("[data-protected]")).toBeVisible();
  });

  test("คลิกขวาและคัดลอกถูกบล็อก แล้วถูกบันทึกเป็นเหตุการณ์ (FR-15.1 · FR-15.8)", async ({
    page,
  }) => {
    await openTextLesson(page);

    const posted = page.waitForRequest(
      (request) =>
        request.url().includes("/api/events/screen") && request.method() === "POST",
      { timeout: 30_000 },
    );

    const defaultPrevented = await page.evaluate(() => {
      const target = document.querySelector("[data-protected]")!;
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(defaultPrevented).toBe(true);

    await posted;
  });

  test("เนื้อหาถูกซ่อนเมื่อหน้าต่างเสียโฟกัส (FR-15.3)", async ({ page }) => {
    await openTextLesson(page);

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.getByText("เนื้อหาถูกซ่อนไว้ชั่วคราว")).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("เนื้อหาถูกซ่อนไว้ชั่วคราว")).toHaveCount(0);
  });

  test("สั่งพิมพ์แล้วไม่ได้เนื้อหาบทเรียนติดไปด้วย (FR-15.4)", async ({ page }) => {
    await openTextLesson(page);

    const body = page.locator("[data-protected] > div").first();
    await expect(body).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(body).toBeHidden();

    await page.emulateMedia({ media: "screen" });
    await expect(body).toBeVisible();
  });
});

test.describe("ผู้ดูแลระบบดูรายงานและสวิตช์การป้องกัน", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("หน้ารายงานแสดงเหตุการณ์ที่บันทึกไว้ (FR-15.8)", async ({ page }) => {
    await page.goto("/admin/screen-events");

    await expect(page.getByRole("heading", { name: "ความปลอดภัยเนื้อหา", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "การป้องกันเนื้อหาระดับระบบ" })).toBeVisible();
    // ชุดเทสต์ด้านบนสร้างเหตุการณ์ "คลิกขวา" ไว้แล้ว
    await expect(page.getByText("คลิกขวา").first()).toBeVisible({ timeout: 30_000 });
    // ข้อจำกัดของการป้องกันบนเว็บต้องบอกผู้ดูแลไว้ตรง ๆ (spec §M15)
    await expect(page.getByText(/ตรวจจับการจับภาพระดับระบบปฏิบัติการไม่ได้/)).toBeVisible();
  });
});

test.describe("ผู้เรียนทั่วไปเข้าหน้ารายงานไม่ได้", () => {
  test("deny by default — ผู้เรียนเปิด /admin/screen-events ไม่ได้ (NFR-04)", async ({ page }) => {
    const response = await page.goto("/admin/screen-events");
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("ผู้สอนควบคุมการป้องกันระดับคอร์ส", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("มีสวิตช์การป้องกันในฟอร์มคอร์ส และเปิดอยู่เป็นค่าตั้งต้น (FR-15.9)", async ({ page }) => {
    await page.goto("/teach");
    await page.getByRole("link", { name: COURSE_TITLE }).first().click();

    const toggle = page.getByRole("checkbox", { name: /ป้องกันการคัดลอกเนื้อหา/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();
  });
});
