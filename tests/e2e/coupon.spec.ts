import { expect, test, type Browser } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { CouponFixture, CouponState } from "./support/coupon-fixture";

/**
 * M18 · FR-18.2 — คูปองส่วนลด (phase-4-plan ขั้น 3) ผ่านผู้ให้บริการจำลอง
 * ผู้ดูแลสร้างคูปองที่ `/admin/coupons` → ผู้เรียนใช้ที่หน้า checkout · ยอดคำนวณที่ server ·
 * ลดเต็มจำนวน = ได้สิทธิ์ทันทีไม่ผ่าน gateway · คูปองหมดอายุ/ผิดคอร์สถูกปฏิเสธด้วยข้อความไทย
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const courseTitle = (p: string) => `คอร์สคูปอง ${p} ${RUN_ID}`;
const codes = (p: string) => ({
  save: `SAVE20-${p.toUpperCase()}-${RUN_ID}`,
  free: `FREE-${p.toUpperCase()}-${RUN_ID}`,
  expired: `OLD-${p.toUpperCase()}-${RUN_ID}`,
});

test.describe.configure({ mode: "serial" });
test.slow();
test.use({ storageState: STATE_FILE.student });

const fixtures = new Map<string, CouponFixture>();
const inspect = (p: string) => {
  const c = codes(p);
  return runFixture<CouponState>("coupon-fixture.ts", "inspect", { ...fixtures.get(p)!, codes: [c.save, c.free, c.expired] });
};

test.afterAll(() => {
  for (const [p, f] of fixtures) {
    const c = codes(p);
    runFixture("coupon-fixture.ts", "cleanup", { ...f, codes: [c.save, c.free, c.expired] });
  }
});

async function asAdmin(browser: Browser) {
  const context = await browser.newContext({ storageState: STATE_FILE.admin });
  return { context, page: await context.newPage() };
}

test("เตรียมคอร์สและคูปองหมดอายุ", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<CouponFixture>("coupon-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`.toLowerCase(),
      title: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
      expiredCode: codes(p).expired,
    }),
  );
});

test("ผู้ดูแลสร้างคูปอง · รหัสซ้ำถูกปฏิเสธ", async ({ browser }, info) => {
  const p = info.project.name;
  const c = codes(p);
  const { context, page } = await asAdmin(browser);
  await page.goto("/admin/coupons");
  const form = page.getByRole("form", { name: "สร้างคูปอง" });

  // ลด 20% คอร์สเดียว ใช้ได้ครั้งเดียว — พิมพ์ตัวเล็ก ระบบเก็บเป็นตัวใหญ่
  await form.getByLabel("รหัสคูปอง", { exact: true }).fill(c.save.toLowerCase());
  await form.getByLabel("ลด (%)").fill("20");
  await form.getByLabel("ใช้กับ").selectOption({ label: courseTitle(p) });
  await form.getByLabel("จำกัดจำนวนครั้ง").fill("1");
  await form.getByRole("button", { name: "สร้างคูปอง" }).click();
  await expect(page.getByText(`สร้างคูปอง ${c.save} แล้ว`)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`[data-coupon="${c.save}"]`)).toContainText("ใช้งานได้");

  // ลด 1,000 บาท (มากกว่าราคา) ของอีกคอร์ส → เหลือ 0
  await form.getByLabel("รหัสคูปอง", { exact: true }).fill(c.free);
  await form.getByLabel("ชนิดส่วนลด").selectOption("amount");
  await form.getByLabel("ลด (บาท)").fill("1000");
  await form.getByLabel("ใช้กับ").selectOption({ label: `${courseTitle(p)} (ฟรีด้วยคูปอง)` });
  await form.getByRole("button", { name: "สร้างคูปอง" }).click();
  await expect(page.locator(`[data-coupon="${c.free}"]`)).toContainText("ลด ฿1,000", { timeout: 30_000 });

  await form.getByLabel("รหัสคูปอง", { exact: true }).fill(c.save);
  await form.getByLabel("ลด (%)").fill("5");
  await form.getByRole("button", { name: "สร้างคูปอง" }).click();
  await expect(form.getByText("รหัสคูปองนี้มีอยู่แล้ว")).toBeVisible({ timeout: 30_000 });
  // บันทึกไม่ผ่าน ค่าที่กรอกยังอยู่
  await expect(form.getByLabel("ลด (%)")).toHaveValue("5");
  await context.close();
});

test("ผู้เรียนใช้คูปองหมดอายุ/ผิดคอร์สไม่ได้ · ใช้คูปองลด 20% แล้วจ่ายยอดหลังลด", async ({ page }, info) => {
  const p = info.project.name;
  const c = codes(p);
  const f = fixtures.get(p)!;
  await page.goto(`/checkout/${f.courseId}`);
  await expect(page.locator("[data-checkout-total]")).toHaveText("฿750", { timeout: 30_000 });
  const coupon = page.getByLabel("รหัสคูปอง (ถ้ามี)");

  await coupon.fill(c.expired);
  await page.getByRole("button", { name: "ใช้คูปอง" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "คูปองนี้หมดอายุแล้ว" })).toBeVisible({ timeout: 30_000 });

  await coupon.fill(c.free);
  await page.getByRole("button", { name: "ใช้คูปอง" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "คูปองนี้ใช้กับคอร์สนี้ไม่ได้" })).toBeVisible({ timeout: 30_000 });

  await coupon.fill(c.save.toLowerCase());
  await page.getByRole("button", { name: "ใช้คูปอง" }).click();
  await expect(page.locator("[data-checkout-discount]")).toHaveText("−฿150", { timeout: 30_000 });
  await expect(page.locator("[data-checkout-total]")).toHaveText("฿600");

  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿600" }).click();
  await expect(page.locator("[data-mock-amount]")).toHaveText("฿600", { timeout: 30_000 });
  await page.getByRole("button", { name: "จ่ายด้วย PromptPay (สำเร็จ)" }).click();
  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-order-discount]")).toHaveText("−฿150");

  const state = inspect(p);
  expect(state.orders).toEqual([
    { courseId: f.courseId, status: "PAID", subtotal: "750", discount: "150", amount: "600", couponCode: c.save, method: "promptpay" },
  ]);
  expect(state.coupons[c.save]).toBe(1);
  expect(state.coupons[c.expired]).toBe(0);
});

test("คูปองลดเต็มจำนวน → ได้สิทธิ์เรียนทันทีโดยไม่ผ่านหน้าชำระเงิน", async ({ page }, info) => {
  const p = info.project.name;
  const c = codes(p);
  const f = fixtures.get(p)!;
  await page.goto(`/checkout/${f.freeCourseId}`);
  await page.getByLabel("รหัสคูปอง (ถ้ามี)").fill(c.free);
  await page.getByRole("button", { name: "ใช้คูปอง" }).click();
  await expect(page.locator("[data-checkout-total]")).toHaveText("฿0", { timeout: 30_000 });

  await page.getByRole("button", { name: "รับสิทธิ์เรียนด้วยคูปอง" }).click();
  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("คูปองส่วนลด 100%")).toBeVisible();
  await page.getByRole("link", { name: "เริ่มเรียน" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${f.freeCourseId}`), { timeout: 30_000 });

  const state = inspect(p);
  const free = state.orders.find((o) => o.courseId === f.freeCourseId)!;
  expect(free).toMatchObject({ status: "PAID", amount: "0", discount: "750", method: "coupon", couponCode: c.free });
  expect(state.enrollments).toHaveLength(2);
  expect(state.enrollments.every((e) => e.source === "PURCHASE")).toBe(true);
  expect(state.coupons[c.free]).toBe(1);
});

test("ผู้ดูแลเห็นคูปองที่ใช้ครบแล้ว และปิดใช้ได้", async ({ browser }, info) => {
  const c = codes(info.project.name);
  const { context, page } = await asAdmin(browser);
  await page.goto(`/admin/coupons?q=${c.save}`);
  const card = page.locator(`[data-coupon="${c.save}"]`);
  await expect(card).toContainText("ใช้ครบแล้ว");
  await expect(card).toContainText("ใช้แล้ว 1 / 1 ครั้ง");

  await card.getByRole("button", { name: `ปิดใช้คูปอง ${c.save}` }).click();
  await expect(card).toContainText("ปิดใช้", { timeout: 30_000 });
  await expect(card.getByRole("button", { name: `เปิดใช้คูปอง ${c.save}` })).toBeVisible();
  await context.close();
});
