import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { CheckoutFixture, CheckoutState } from "./support/checkout-fixture";

/**
 * M18 · FR-18.1 — สั่งซื้อและชำระเงินผ่านผู้ให้บริการจำลอง (phase-4-plan ขั้น 2)
 * ต้องตั้ง PAYMENT_PROVIDER=mock · PAYMENT_WEBHOOK_SECRET · ALLOW_MOCK_PAYMENT=true ใน .env (ดู .env.example)
 * ผลการชำระตัดสินที่ webhook + retrieve เท่านั้น · webhook ปลอม/ซ้ำต้องไม่เปิดสิทธิ์ซ้ำ
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สขาย ${p} ${RUN_ID}`;
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "";

test.describe.configure({ mode: "serial" });
test.slow();
test.use({ storageState: STATE_FILE.student });

const fixtures = new Map<string, CheckoutFixture>();
const inspect = (p: string) => runFixture<CheckoutState>("checkout-fixture.ts", "inspect", fixtures.get(p)!);

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("checkout-fixture.ts", "cleanup", f);
});

test("เตรียมคอร์ส", async ({}, info) => {
  expect(SECRET, "ต้องตั้ง PAYMENT_WEBHOOK_SECRET ใน .env").not.toBe("");
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<CheckoutFixture>("checkout-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      title: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
    }),
  );
});

test("จ่ายไม่สำเร็จ → ยังไม่ได้สิทธิ์เรียน", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto(`/courses/${f.slug}`);
  await page.getByRole("link", { name: /ซื้อคอร์ส ฿750/ }).click();
  await expect(page.locator("[data-checkout-total]")).toHaveText("฿750", { timeout: 30_000 });
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" }).click();

  await expect(page.locator("[data-mock-amount]")).toHaveText("฿750", { timeout: 30_000 });
  await page.getByRole("button", { name: "จำลองการจ่ายไม่สำเร็จ" }).click();
  await expect(page.locator("[data-order-status=FAILED]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("ไม่สำเร็จ/หมดอายุ")).toBeVisible();

  const state = inspect(info.project.name);
  expect(state.orders.map((o) => o.status)).toEqual(["FAILED"]);
  expect(state.enrollment).toBeNull();
});

test("คำสั่งซื้อที่ทิ้งไว้จนหมดอายุ → cron ปิดเป็น FAILED", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto(`/checkout/${f.courseId}`);
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" }).click();
  await expect(page.locator("[data-mock-amount]")).toBeVisible({ timeout: 30_000 });
  // ไม่กดจ่าย — ปล่อยให้หมดอายุ
  const pending = inspect(info.project.name).orders.find((o) => o.status === "PENDING")!;
  runFixture("checkout-fixture.ts", "expire", { orderId: pending.id });

  const cron = await page.request.post("/api/cron/orders", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  expect(inspect(info.project.name).orders.map((o) => o.status)).toEqual(["FAILED", "FAILED"]);
});

test("ลองใหม่ด้วย PromptPay → ชำระแล้วเข้าเรียนได้ · แจ้งเตือน", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto(`/checkout/${f.courseId}`);
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" }).click();
  await page.getByRole("button", { name: "จ่ายด้วย PromptPay (สำเร็จ)" }).click();

  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("PromptPay")).toBeVisible();
  await page.getByRole("link", { name: "เริ่มเรียน" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${f.courseId}`), { timeout: 30_000 });

  const state = inspect(info.project.name);
  expect(state.orders.map((o) => o.status)).toEqual(["FAILED", "FAILED", "PAID"]);
  expect(state.enrollment).toEqual({ status: "ACTIVE", source: "PURCHASE" });
  expect(state.paidAudits).toBe(1);

  await page.goto("/notifications");
  await expect(page.getByText(`ชำระเงินสำเร็จ — เริ่มเรียน “${courseTitle(info.project.name)}” ได้เลย`)).toBeVisible();

  // ซื้อแล้ว — หน้าคอร์สไม่มีปุ่มซื้ออีก · หน้า checkout บอกว่ามีสิทธิ์แล้ว
  await page.goto(`/courses/${f.slug}`);
  await expect(page.getByRole("link", { name: /ซื้อคอร์ส/ })).toHaveCount(0);
  await page.goto(`/checkout/${f.courseId}`);
  await expect(page.getByText("คุณมีสิทธิ์เรียนคอร์สนี้อยู่แล้ว")).toBeVisible();

  await page.goto("/orders");
  await expect(page.locator(`[data-order="${state.orders[2]!.id}"]`)).toContainText("ชำระแล้ว");
});

test("webhook ปลอม/ซ้ำไม่เปิดสิทธิ์ซ้ำ", async ({ page }, info) => {
  const state = inspect(info.project.name);
  const paid = state.orders.find((o) => o.status === "PAID")!;
  const body = JSON.stringify({ id: `evt_e2e_${RUN_ID}_${info.project.name}`, type: "charge.complete", data: { ref: paid.providerRef } });
  const signature = createHmac("sha256", SECRET).update(body).digest("hex");

  const forged = await page.request.post("/api/payment/webhook/mock", { data: body, headers: { "x-mock-signature": "00".repeat(32) } });
  expect(forged.status()).toBe(400);
  const other = await page.request.post("/api/payment/webhook/omise", { data: body });
  expect(other.status()).toBe(404);

  const first = await page.request.post("/api/payment/webhook/mock", { data: body, headers: { "x-mock-signature": signature } });
  expect(first.status()).toBe(200);
  const replay = await page.request.post("/api/payment/webhook/mock", { data: body, headers: { "x-mock-signature": signature } });
  expect(await replay.text()).toBe("duplicate");

  const after = inspect(info.project.name);
  expect(after.paidAudits).toBe(1);
  expect(after.enrollment).toEqual({ status: "ACTIVE", source: "PURCHASE" });
});

test("หน้าชำระจำลองเปิดได้เฉพาะ ref ที่ถูกต้อง", async ({ page }, info) => {
  const paid = inspect(info.project.name).orders.find((o) => o.status === "PAID")!;
  const res = await page.goto(`/checkout/mock/${paid.id}?ref=mock_deadbeef`);
  expect(res?.status()).toBe(404);
});
