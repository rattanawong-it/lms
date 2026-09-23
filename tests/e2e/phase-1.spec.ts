import { expect, test } from "@playwright/test";
import { STATE_FILE } from "./constants";

/**
 * e2e ปิด Phase 1 (docs/phase-1-plan.md ขั้น 7)
 * สร้างคอร์ส → อนุมัติ → ลงทะเบียน → เรียน → ความคืบหน้าขึ้น → watermark ปรากฏ
 *
 * เดินทุกโมดูลของเฟสต่อกันในเส้นทางเดียว (M04 → M03 → M06 → M05 → M15 → M11)
 * แต่ละ project สร้างคอร์สของตัวเอง จึงรัน desktop กับ mobile พร้อมกันได้
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const slug = (project: string) => `e2e-phase1-${project}-${RUN_ID}`;
const title = (project: string) => `คอร์สปิดเฟส 1 ${project} ${RUN_ID}`;

const SECTION = "บทที่ 1 เริ่มต้น";
const LESSON_A = "บทเรียนแรก";
const LESSON_B = "บทเรียนที่สอง";

test.describe.configure({ mode: "serial" });

test.describe("ผู้สอนสร้างคอร์สและส่งตรวจ", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์ส เพิ่มบทเรียน 2 บท แล้วส่งให้คณะอนุมัติ", async ({ page }, info) => {
    await page.goto("/teach/courses/new");
    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(title(info.project.name));
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(slug(info.project.name));
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();
    await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/, { timeout: 30_000 });

    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill(SECTION);
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(SECTION) })).toBeVisible();

    for (const lesson of [LESSON_A, LESSON_B]) {
      await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
      await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill(lesson);
      await page
        .getByLabel("ลิงก์วิดีโอ", { exact: true })
        .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
      await expect(page.getByText(lesson, { exact: true })).toBeVisible({ timeout: 15_000 });
    }

    await page.getByRole("link", { name: "ตั้งค่าคอร์ส" }).first().click();
    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("รอคณะอนุมัติ", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้ดูแลอนุมัติ", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("อนุมัติและเผยแพร่คอร์ส", async ({ page }, info) => {
    await page.goto("/admin/courses");
    await page
      .getByRole("row", { name: new RegExp(title(info.project.name)) })
      .getByRole("link", { name: "ตรวจคอร์ส" })
      .click();
    await page.getByRole("button", { name: "อนุมัติและเผยแพร่" }).click();
    await expect(page.getByText("เผยแพร่แล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้เรียน", () => {
  test("ลงทะเบียน → ได้รับแจ้งเตือน → เรียนจบ 1 ใน 2 บท → ความคืบหน้า 50% → มีลายน้ำ", async ({
    page,
  }, info) => {
    await page.goto(`/courses/${slug(info.project.name)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({
      timeout: 30_000,
    });

    // M11 — การลงทะเบียนเขียนการแจ้งเตือนไว้ตั้งแต่ M06 (CHANGELOG #12) ตอนนี้ต้องเห็นในหน้ารวม
    await page.goto("/notifications");
    await expect(
      page.locator("[data-notification]").filter({ hasText: title(info.project.name) }).first(),
    ).toBeVisible();

    await page.goto(`/courses/${slug(info.project.name)}`);
    await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
    await expect(page.getByRole("heading", { name: LESSON_A, level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // M15 — ลายน้ำติดอีเมลของผู้เรียน
    const watermark = page.locator("[data-watermark]");
    await expect(watermark).toHaveCount(1);
    await expect(watermark.locator("span").first()).toContainText("student@krirk.ac.th");

    // M06 — เรียนจบ 1 ใน 2 บท = 50%
    await page.getByRole("button", { name: "เรียนจบบทนี้" }).click();
    await expect(page.getByRole("button", { name: "ยกเลิกการทำเครื่องหมาย" })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/my-courses");
    const card = page.getByRole("listitem").filter({ hasText: title(info.project.name) }).first();
    await expect(card.getByRole("progressbar")).toHaveAccessibleName(/เรียนไปแล้ว 50 เปอร์เซ็นต์/);
  });
});
