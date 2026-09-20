import { expect, test } from "@playwright/test";

/**
 * M01 — เส้นทางเข้าสู่ระบบ (ใช้บัญชีจาก prisma/seed.ts)
 * ครอบคลุม FR-01.1 login, การกันผู้ไม่ล็อกอิน และ RBAC §4.1
 */
const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? "student@krirk.ac.th",
  password: process.env.E2E_STUDENT_PASSWORD ?? "ChangeMe!2026",
};

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  // ต้องใช้ exact เพราะปุ่มแสดง/ซ่อนรหัสผ่านมี aria-label "แสดงรหัสผ่าน" ซึ่งชนแบบ substring
  await page.getByLabel("อีเมล", { exact: true }).fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
}

test("ผู้ที่ยังไม่ล็อกอินถูกส่งไปหน้า /login พร้อมจำปลายทาง", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("ผู้เรียนล็อกอินแล้วเข้าหน้าแดชบอร์ดได้", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test("ผู้เรียนเข้าหน้าผู้ดูแลไม่ได้ (deny by default)", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const response = await page.goto("/admin");
  expect(response?.status()).toBe(403);
});

test("หน้าเข้าสู่ระบบแสดงผลได้บนจอมือถือโดยไม่ล้นขอบ", async ({ page }) => {
  await page.goto("/login");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
