import { expect, test } from "@playwright/test";
import { ACCOUNTS, ANONYMOUS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { PricingFixture } from "./support/pricing-fixture";

/**
 * M18 · FR-18.1 ส่วนแรก — ตั้งราคาและแสดงราคา (phase-4-plan ขั้น 1)
 * เครื่องทดสอบใช้ผู้ให้บริการจำลอง (PAYMENT_PROVIDER=mock) → คอร์สที่มีราคามีปุ่มซื้อแทนปุ่มลงทะเบียนฟรี
 * คอร์สตัวอย่าง `excel-for-work` (990 บาท) มาจาก seed · คอร์สของผู้สอนเตรียมตรงใน DB แยกต่อ project
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, PricingFixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("pricing-fixture.ts", "cleanup", f);
});

test("เตรียมคอร์ส", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(p, runFixture<PricingFixture>("pricing-fixture.ts", "setup", { tag: `${p}-${RUN_ID}`, instructorEmail: ACCOUNTS.instructor.email }));
});

test.describe("ผู้เยี่ยมชม", () => {
  test.use({ storageState: ANONYMOUS });

  test("คลังคอร์สแสดงราคา/ฟรี · หน้าคอร์สที่มีราคาไม่มีปุ่มลงทะเบียน", async ({ page }, info) => {
    await page.goto(`/courses?q=${encodeURIComponent("Excel สำหรับการทำงาน")}`);
    const card = page.getByRole("article").filter({ hasText: "Excel สำหรับการทำงาน" });
    await expect(card.locator("[data-price]")).toHaveText("฿990", { timeout: 30_000 });

    await page.goto(`/courses?q=${encodeURIComponent("การตลาดดิจิทัล")}`);
    await expect(page.getByRole("article").first().locator("[data-price]")).toHaveText("ฟรี");

    await page.goto("/courses/excel-for-work");
    await expect(page.locator("[data-course-price]")).toHaveText("฿990");
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบเพื่อซื้อคอร์ส" })).toHaveAttribute("href", /\/login\?next=/);
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบเพื่อลงทะเบียน" })).toHaveCount(0);

    // มีราคาแต่รับผ่านการอนุมัติ → ซื้อเองไม่ได้
    await page.goto(`/courses/${fixtures.get(info.project.name)!.approval.slug}`);
    await expect(page.getByRole("button", { name: "ยังซื้อไม่ได้" })).toBeDisabled();
    await expect(page.getByText("รับผู้เรียนผ่านผู้สอน/ผู้ดูแล")).toBeVisible();
  });
});

test.describe("ผู้เรียน", () => {
  test.use({ storageState: STATE_FILE.student });

  test("คอร์สที่มีราคาไม่มีปุ่มลงทะเบียนฟรี มีแต่ปุ่มซื้อ", async ({ page }) => {
    await page.goto("/courses/excel-for-work");
    await expect(page.getByRole("link", { name: /ซื้อคอร์ส ฿990/ })).toHaveAttribute("href", /^\/checkout\//, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "ลงทะเบียนเรียน" })).toHaveCount(0);
  });
});

test.describe("ผู้สอน", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("คอร์สร่าง: ตั้งราคาได้ · ค่าผิดได้ข้อความไทย", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/teach/courses/${f.draft.id}`);
    const price = page.getByLabel("ราคา (บาท)");
    await expect(price).toBeEnabled({ timeout: 30_000 });

    await price.fill("0.5");
    await price.press("Enter");
    await expect(page.getByText("ราคาต่ำสุด 1 บาท (หรือเว้นว่างเพื่อเปิดฟรี)").first()).toBeVisible({ timeout: 15_000 });

    await price.fill("1,290");
    await price.press("Enter");
    await expect(page.getByText("บันทึกข้อมูลคอร์สแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByLabel("ราคา (บาท)")).toHaveValue("1290");
  });

  test("คอร์สที่เผยแพร่แล้ว: ช่องราคาถูกล็อก (Q3)", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/teach/courses/${f.published.id}`);
    await expect(page.getByLabel("ราคา (บาท)")).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByText("ติดต่อผู้ดูแลเพื่อเปลี่ยนราคา")).toBeVisible();
  });
});

test.describe("ผู้ดูแลระบบ", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("คิวอนุมัติเห็นราคาที่ผู้สอนเสนอ · ผู้ดูแลแก้ราคาคอร์สที่เผยแพร่แล้วได้", async ({ page, browser }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto("/admin/courses");
    const row = page.getByRole("row").filter({ hasText: f.pending.title });
    await expect(row.locator("[data-review-price]")).toHaveText("ราคา ฿1,290", { timeout: 30_000 });

    await page.goto(`/teach/courses/${f.published.id}`);
    const price = page.getByLabel("ราคา (บาท)");
    await expect(price).toBeEnabled({ timeout: 30_000 });
    await price.fill("890");
    await price.press("Enter");
    await expect(page.getByText("บันทึกข้อมูลคอร์สแล้ว").first()).toBeVisible({ timeout: 15_000 });

    // ผู้ดูแลเข้าหน้าเรียนได้โดยไม่ต้องซื้อ จึงไม่เห็นแผงซื้อ — ดูราคาใหม่ในมุมผู้เยี่ยมชม
    const guest = await browser.newContext({ storageState: ANONYMOUS });
    const view = await guest.newPage();
    await view.goto(`/courses/${f.published.slug}`);
    await expect(view.locator("[data-course-price]")).toHaveText("฿890");
    await guest.close();
  });
});
