import { expect, test } from "@playwright/test";
import { ANONYMOUS } from "./constants";
import { runFixture } from "./helpers";
import type { PasswordFixture, PasswordState } from "./support/password-fixture";

/**
 * M01 · FR-01.9 — ตั้งรหัสผ่าน (บัญชีที่เข้าด้วย Google อย่างเดียว) แล้วเปลี่ยนรหัสผ่าน
 * ใช้ผู้ใช้ชั่วคราวที่สร้าง session ตรงใน DB — ไม่กินโควตาล็อกอินและไม่แตะรหัสของบัญชีทดสอบหลัก
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FIRST = "Google-First#2026";
const SECOND = "Changed-Second#2026";

test.describe.configure({ mode: "serial" });
test.use({ storageState: ANONYMOUS });
test.slow();

const fixtures = new Map<string, PasswordFixture>();
const state = (f: PasswordFixture) => runFixture<PasswordState>("password-fixture.ts", "state", f);

test.beforeAll(({}, info) => {
  fixtures.set(info.project.name, runFixture<PasswordFixture>("password-fixture.ts", "setup", { tag: `${info.project.name}-${RUN_ID}` }));
});

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("password-fixture.ts", "cleanup", f);
});

test.beforeEach(async ({ context, baseURL }, info) => {
  const f = fixtures.get(info.project.name)!;
  // next start ใช้ชื่อ __Secure- ส่วน next dev ไม่ใช้ — ใส่ทั้งสองแบบให้รันได้กับทั้งคู่
  await context.addCookies(
    ["__Secure-krirk-lms.session_token", "krirk-lms.session_token"].map((name) => ({
      name,
      value: f.cookie,
      // ระบุ domain/path แทน url — Chrome ไม่รับ cookie secure ที่ผูกกับ url แบบ http
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    })),
  );
});

test("บัญชี Google อย่างเดียวตั้งรหัสผ่านได้ และออกจากอุปกรณ์อื่น", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto("/settings/password");
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่าน" })).toBeVisible();
  await expect(page.getByLabel("รหัสผ่านปัจจุบัน")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /ออกจากระบบบนอุปกรณ์อื่น/ })).toBeChecked();

  // ยืนยันไม่ตรง → แจ้งใต้ช่อง ไม่บันทึก
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(FIRST);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(`${FIRST}x`);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").press("Enter");
  await expect(page.getByText("รหัสผ่านทั้งสองช่องไม่ตรงกัน")).toBeVisible();
  expect((await state(f)).passwordHash).toBeNull();

  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(FIRST);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").press("Enter");
  await expect(page.getByText("ตั้งรหัสผ่านแล้ว และออกจากระบบอุปกรณ์อื่นทั้งหมด")).toBeVisible();
  await expect(page.getByRole("heading", { name: "เปลี่ยนรหัสผ่าน" })).toBeVisible();

  const after = await state(f);
  expect(after.passwordHash).not.toBeNull();
  expect(after.passwordHash).not.toContain(FIRST);
  expect(after.sessions).toBe(1);
  expect(after.audit).toContain("user.password.set");
});

test("เปลี่ยนรหัสผ่าน — รหัสเดิมผิดถูกปฏิเสธ · ถูกแล้วบันทึกพร้อม audit", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  const before = await state(f);

  await page.goto("/settings/password");
  await expect(page.getByRole("heading", { name: "เปลี่ยนรหัสผ่าน" })).toBeVisible();

  const current = page.getByLabel("รหัสผ่านปัจจุบัน");
  await current.fill("not-the-password");
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(SECOND);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(SECOND);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").press("Enter");
  await expect(page.getByText("รหัสผ่านปัจจุบันไม่ถูกต้อง").first()).toBeVisible();
  expect((await state(f)).passwordHash).toBe(before.passwordHash);

  // ค่าที่กรอกยังอยู่ (submitForm ไม่ล้างฟอร์ม) — แก้เฉพาะรหัสเดิม
  await current.fill(FIRST);
  await page.getByRole("checkbox", { name: /ออกจากระบบบนอุปกรณ์อื่น/ }).uncheck();
  await current.press("Enter");
  await expect(page.getByText("เปลี่ยนรหัสผ่านแล้ว", { exact: true })).toBeVisible();
  await expect(current).toHaveValue("");

  const after = await state(f);
  expect(after.passwordHash).not.toBe(before.passwordHash);
  expect(after.audit).toContain("user.password.change");
});
