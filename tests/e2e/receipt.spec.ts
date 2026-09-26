import { expect, test, type Browser } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { ReceiptFixture, ReceiptState } from "./support/receipt-fixture";

/**
 * M18 · FR-18.2 — ใบเสร็จรับเงิน (phase-4-plan ขั้น 4) ผ่านผู้ให้บริการจำลอง
 * ผู้ดูแลตั้งผู้ขาย → ซื้อสำเร็จได้เลขใบเสร็จต่อเนื่อง + snapshot ผู้ขาย/ผู้ซื้อ → ดาวน์โหลดได้เฉพาะเจ้าของ/ผู้ดูแลระบบ
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const courseTitle = (p: string) => `คอร์สใบเสร็จ ${p} ${RUN_ID}`;
const SELLER = "สถาบันทดสอบใบเสร็จ e2e";

test.describe.configure({ mode: "serial" });
test.slow();
test.use({ storageState: STATE_FILE.student });

const fixtures = new Map<string, ReceiptFixture>();
const inspect = (p: string) => runFixture<ReceiptState>("receipt-fixture.ts", "inspect", fixtures.get(p)!);

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("receipt-fixture.ts", "cleanup", f);
});

async function as(browser: Browser, account: keyof typeof STATE_FILE) {
  const context = await browser.newContext({ storageState: STATE_FILE[account] });
  return { context, page: await context.newPage() };
}

test("เตรียมคอร์ส · ผู้ดูแลตั้งข้อมูลผู้ขาย", async ({ browser }, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<ReceiptFixture>("receipt-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      title: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
    }),
  );

  const { context, page } = await as(browser, "admin");
  await page.goto("/admin/settings");
  const form = page.getByRole("form", { name: "ข้อมูลผู้ขายบนใบเสร็จ" });
  await form.getByLabel("ชื่อผู้ขาย / นิติบุคคล").fill(SELLER);
  await form.getByLabel("เลขประจำตัวผู้เสียภาษี (ไม่บังคับ)").fill("12345");
  await form.getByRole("button", { name: "บันทึกข้อมูลผู้ขาย" }).click();
  await expect(form.getByText("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")).toBeVisible({ timeout: 30_000 });

  await form.getByLabel("เลขประจำตัวผู้เสียภาษี (ไม่บังคับ)").fill("0-9940-00123-45-6");
  await form.getByRole("button", { name: "บันทึกข้อมูลผู้ขาย" }).click();
  await expect(page.getByText("บันทึกข้อมูลผู้ขายแล้ว — มีผลกับใบเสร็จที่ออกหลังจากนี้")).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test("ซื้อสำเร็จ → ได้เลขใบเสร็จและดาวน์โหลด PDF ได้", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto(`/checkout/${f.courseId}`);
  await page.getByRole("button", { name: "ไปหน้าชำระเงิน ฿750" }).click();
  await page.getByRole("button", { name: "จ่ายด้วยบัตร (สำเร็จ)" }).click();
  await expect(page.locator("[data-order-status=PAID]")).toBeVisible({ timeout: 30_000 });

  const { order } = inspect(info.project.name);
  expect(order?.receiptNo).toMatch(/^RC25\d\d-\d{6}$/);
  expect(order?.billing?.seller.name).toBe(SELLER);
  expect(order?.billing?.buyer.email).toBe(ACCOUNTS.student.email);

  const link = page.getByRole("link", { name: `ดาวน์โหลดใบเสร็จ ${order!.receiptNo}` });
  await expect(link).toHaveAttribute("href", `/api/receipt/${order!.id}`);
  const res = await page.request.get(`/api/receipt/${order!.id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain(`${order!.receiptNo}.pdf`);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("ใบเสร็จของคนอื่นดาวน์โหลดไม่ได้ · ผู้ดูแลระบบดาวน์โหลดได้", async ({ browser, page }, info) => {
  const { order } = inspect(info.project.name);
  const instructor = await as(browser, "instructor");
  expect((await instructor.page.request.get(`/api/receipt/${order!.id}`)).status()).toBe(404);
  await instructor.context.close();

  const admin = await as(browser, "admin");
  expect((await admin.page.request.get(`/api/receipt/${order!.id}`)).status()).toBe(200);
  await admin.context.close();

  // ไม่มีใบเสร็จ / รหัสผิดรูปแบบ
  expect((await page.request.get("/api/receipt/not-an-id")).status()).toBe(404);
});

test("ออกเลขพร้อมกัน 20 รายการไม่ซ้ำไม่ข้าม", async ({}, info) => {
  const values = runFixture<number[]>("receipt-fixture.ts", "race", { key: `e2e:${info.project.name}:${RUN_ID}`, count: 20 });
  expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
});
