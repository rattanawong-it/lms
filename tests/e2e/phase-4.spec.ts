import { expect, test, type Browser } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture, teachSearch } from "./helpers";
import type { Phase4Fixture } from "./support/phase4-fixture";

/**
 * ปิด Phase 4 — ครบ flow การขายผ่านผู้ให้บริการจำลอง (phase-4-plan ขั้น 6)
 * ซื้อด้วยคูปอง → เรียนได้ → ใบเสร็จ → ผู้สอนเห็นจำนวนผู้ซื้อ (ไม่เห็นยอดเงิน) → รายงานยอดขาย → คืนเงิน → ยอดสุทธิ
 * ผู้ดูแลคณะอื่นไม่เห็นยอดขายของคอร์สนี้ (ขอบเขตคณะบังคับใน query)
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const courseTitle = (p: string) => `คอร์สปิดเฟส 4 ${p} ${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.slow();
test.use({ storageState: STATE_FILE.student });

const fixtures = new Map<string, Phase4Fixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("phase4-fixture.ts", "cleanup", f);
});

async function as(browser: Browser, account: keyof typeof STATE_FILE) {
  const context = await browser.newContext({ storageState: STATE_FILE[account] });
  return { context, page: await context.newPage() };
}

const salesUrl = (courseId: string) => `/admin/reports?${new URLSearchParams({ view: "sales", course: courseId })}`;

test("เตรียมคอร์สที่มีราคาและคูปอง", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<Phase4Fixture>("phase4-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      title: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      coupon: `P4-${p}-${RUN_ID}`.toUpperCase(),
    }),
  );
});

test("ผู้เรียนซื้อด้วยคูปอง → เข้าเรียนได้ → ดาวน์โหลดใบเสร็จ", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto(`/courses/${f.slug}`);
  await page.getByRole("link", { name: /ซื้อคอร์ส ฿1,200/ }).click();
  await page.getByLabel("รหัสคูปอง (ถ้ามี)").fill(f.coupon.toLowerCase());
  await page.getByRole("button", { name: "ใช้คูปอง" }).click();
  await expect(page.locator("[data-checkout-total]")).toHaveText("฿900", { timeout: 30_000 });
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿900" }).click();
  await page.getByRole("button", { name: "จ่ายด้วยบัตร (สำเร็จ)" }).click();
  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });

  const receipt = page.getByRole("link", { name: /ดาวน์โหลดใบเสร็จ RC/ });
  const href = await receipt.getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("link", { name: "เริ่มเรียน" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${f.courseId}`), { timeout: 30_000 });
});

test("ผู้สอนเห็นจำนวนผู้ซื้อ ไม่เห็นยอดเงิน", async ({ browser }, info) => {
  const instructor = await as(browser, "instructor");
  await instructor.page.goto(teachSearch(courseTitle(info.project.name)));
  await expect(instructor.page.locator("[data-buyers]")).toHaveText("ผู้ซื้อ 1", { timeout: 30_000 });
  await expect(instructor.page.getByText("฿900")).toHaveCount(0);
  // รายงานยอดขายเป็นของผู้ดูแลเท่านั้น
  expect((await instructor.page.goto("/admin/reports?view=sales"))?.status()).toBe(403);
  await instructor.context.close();
});

test("รายงานยอดขาย → คืนเงิน → ยอดสุทธิเป็น 0", async ({ browser }, info) => {
  const f = fixtures.get(info.project.name)!;
  const admin = await as(browser, "admin");
  await admin.page.goto(salesUrl(f.courseId));
  const row = admin.page.locator("[data-report-row]");
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // คำสั่งซื้อ 1 · ยอดขาย 900 · ส่วนลด 300 · คูปอง 1 · คืน 0 · สุทธิ 900
  await expect(row).toContainText(courseTitle(info.project.name));
  await expect(row.locator("td")).toHaveText(["คณะบริหารธุรกิจ", "1", "฿900", "฿300", "1", "0", "฿0", "฿900"]);

  await admin.page.goto("/admin");
  await expect(admin.page.locator("[data-sales-this-month]")).toContainText("ยอดขายเดือนนี้");

  await admin.page.goto(`/admin/orders?${new URLSearchParams({ q: courseTitle(info.project.name) })}`);
  const card = admin.page.locator("[data-admin-order]");
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await card.getByRole("button", { name: "คืนเงิน" }).click();
  const dialog = admin.page.getByRole("dialog");
  await dialog.getByLabel(/เหตุผล/).fill("ทดสอบปิดเฟส 4 — คืนเงินตามนโยบาย");
  await dialog.getByRole("button", { name: "ยืนยันคืนเงิน" }).click();
  await expect(card).toContainText("คืนเงินแล้ว", { timeout: 30_000 });

  await admin.page.goto(salesUrl(f.courseId));
  await expect(admin.page.locator("[data-report-row]").locator("td")).toHaveText(
    ["คณะบริหารธุรกิจ", "1", "฿900", "฿300", "1", "1", "฿900", "฿0"],
    { timeout: 30_000 },
  );
  await admin.context.close();
});

test("ผู้ดูแลคณะอื่นไม่เห็นยอดขายของคอร์สนี้", async ({ browser }, info) => {
  const f = fixtures.get(info.project.name)!;
  const dept = await as(browser, "deptAdmin");
  await dept.page.goto(salesUrl(f.courseId));
  await expect(dept.page.locator("[data-report-total]")).toContainText("พบ 0", { timeout: 30_000 });
  await expect(dept.page.locator("[data-report-row]")).toHaveCount(0);
  await dept.context.close();
});
