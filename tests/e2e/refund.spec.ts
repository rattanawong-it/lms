import { expect, test, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { RefundFixture, RefundState } from "./support/refund-fixture";

/**
 * M18 · FR-18.2 · Q6 — คืนเงิน (phase-4-plan ขั้น 5) ผ่านผู้ให้บริการจำลอง
 * ผู้ดูแลระบบคืนเงินที่ `/admin/orders` → REFUNDED · สิทธิ์เรียน DROPPED · ใบประกาศถูกเพิกถอน · ใบเสร็จเดิมคงอยู่
 * นอกนโยบาย 7 วัน/20% ต้องติ๊กยืนยันคืนเป็นกรณีพิเศษ
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const courseTitle = (p: string) => `คอร์สคืนเงิน ${p} ${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.slow();
test.use({ storageState: STATE_FILE.student });

const fixtures = new Map<string, RefundFixture>();
const inspect = (p: string, courseId: string) =>
  runFixture<RefundState>("refund-fixture.ts", "inspect", { ...fixtures.get(p)!, courseId });

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("refund-fixture.ts", "cleanup", f);
});

async function buy(page: Page, courseId: string) {
  await page.goto(`/checkout/${courseId}`);
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" }).click();
  await page.getByRole("button", { name: "จ่ายด้วยบัตร (สำเร็จ)" }).click();
  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });
}

async function openOrder(browser: Browser, title: string) {
  const context = await browser.newContext({ storageState: STATE_FILE.admin });
  const page = await context.newPage();
  await page.goto(`/admin/orders?${new URLSearchParams({ q: title })}`);
  const card = page.locator("[data-admin-order]");
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  return { context, page, card };
}

test("เตรียมคอร์ส · ผู้เรียนซื้อทั้งสองคอร์ส", async ({ page }, info) => {
  const p = info.project.name;
  const f = runFixture<RefundFixture>("refund-fixture.ts", "setup", {
    tag: `${p}-${RUN_ID}`,
    title: courseTitle(p),
    instructorEmail: ACCOUNTS.instructor.email,
    studentEmail: ACCOUNTS.student.email,
  });
  fixtures.set(p, f);

  await buy(page, f.inPolicy);
  runFixture("refund-fixture.ts", "afterPurchase", { ...f, courseId: f.inPolicy, backdateDays: 0 });
  await buy(page, f.late);
  runFixture("refund-fixture.ts", "afterPurchase", { ...f, courseId: f.late, backdateDays: 10 });

  expect(inspect(p, f.inPolicy)).toMatchObject({ order: { status: "PAID" }, enrollment: "ACTIVE", certificateRevoked: false });
});

test("คืนเงินตามนโยบาย → ตัดสิทธิ์ · เพิกถอนใบประกาศ · แจ้งผู้ซื้อ", async ({ browser, page }, info) => {
  const p = info.project.name;
  const f = fixtures.get(p)!;
  const admin = await openOrder(browser, `${courseTitle(p)} ตามนโยบาย`);
  await expect(admin.card).toContainText("ชำระแล้ว");
  await expect(admin.card).toContainText("เรียนไปแล้ว 0%");

  await admin.card.getByRole("button", { name: "คืนเงิน" }).click();
  const dialog = admin.page.getByRole("dialog");
  await expect(dialog.getByText("อยู่นอกนโยบายคืนเงิน")).toHaveCount(0);
  await dialog.getByLabel(/เหตุผล/).fill("ผู้เรียนขอยกเลิกภายใน 7 วัน");
  await dialog.getByRole("button", { name: "ยืนยันคืนเงิน" }).click();
  await expect(admin.page.getByText("คืนเงินแล้ว — ตัดสิทธิ์เรียนและแจ้งผู้ซื้อแล้ว")).toBeVisible({ timeout: 30_000 });
  await expect(admin.card).toContainText("คืนเงินแล้ว");
  await expect(admin.card.getByRole("button", { name: "คืนเงิน" })).toHaveCount(0);
  await admin.context.close();

  const state = inspect(p, f.inPolicy);
  expect(state).toMatchObject({
    order: { status: "REFUNDED", refundReason: "ผู้เรียนขอยกเลิกภายใน 7 วัน", refundAmount: "750" },
    enrollment: "DROPPED",
    certificateRevoked: true,
    refundedAudits: 1,
  });
  // ใบเสร็จเดิมคงอยู่และยังดาวน์โหลดได้
  expect(state.order?.receiptNo).toMatch(/^RC25\d\d-\d{6}$/);
  expect((await page.request.get(`/api/receipt/${state.order!.id}`)).status()).toBe(200);

  await page.goto(`/orders/${state.order!.id}`);
  await expect(page.locator("[data-order-status=REFUNDED]")).toBeVisible();
  await expect(page.getByText(/สิทธิ์เรียนคอร์สนี้สิ้นสุดแล้ว/)).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(`คืนเงินค่าคอร์ส “${courseTitle(p)} ตามนโยบาย” แล้ว`)).toBeVisible();
  // ซื้อใหม่ได้ (สิทธิ์เดิมถูกตัดแล้ว)
  await page.goto(`/checkout/${f.inPolicy}`);
  await expect(page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" })).toBeVisible();
});

test("เลย 7 วัน → ต้องยืนยันคืนเป็นกรณีพิเศษ", async ({ browser }, info) => {
  const p = info.project.name;
  const f = fixtures.get(p)!;
  const admin = await openOrder(browser, `${courseTitle(p)} เลยกำหนด`);
  await admin.card.getByRole("button", { name: "คืนเงิน" }).click();
  const dialog = admin.page.getByRole("dialog");
  await expect(dialog.getByText("ชำระมาแล้วเกิน 7 วัน")).toBeVisible();
  await dialog.getByLabel(/เหตุผล/).fill("คอร์สมีปัญหาเนื้อหา อนุมัติโดยคณะ");
  // ยังไม่ติ๊กยืนยัน — เบราว์เซอร์ไม่ส่งฟอร์ม
  await dialog.getByRole("button", { name: "ยืนยันคืนเงิน" }).click();
  await expect(dialog).toBeVisible();
  expect(inspect(p, f.late).order?.status).toBe("PAID");

  await dialog.getByLabel("ยืนยันคืนเงินเป็นกรณีพิเศษ").check();
  await dialog.getByRole("button", { name: "ยืนยันคืนเงิน" }).click();
  await expect(admin.card).toContainText("คืนเงินแล้ว", { timeout: 30_000 });
  await admin.context.close();

  expect(inspect(p, f.late)).toMatchObject({ order: { status: "REFUNDED" }, enrollment: "DROPPED", certificateRevoked: true });
});

test("ผู้เรียนเข้าหน้าคำสั่งซื้อของผู้ดูแลไม่ได้", async ({ page }) => {
  const res = await page.goto("/admin/orders");
  expect(res?.status()).toBe(403);
});
