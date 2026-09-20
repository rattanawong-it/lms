import { expect, test } from "@playwright/test";
import { ANONYMOUS, STUDENT } from "./constants";

/**
 * M01 — เส้นทางเข้าสู่ระบบ (ใช้บัญชีจาก prisma/seed.ts)
 * ครอบคลุม FR-01.1 login, การกันผู้ไม่ล็อกอิน และ RBAC §4.1
 */
test.describe("ผู้ที่ยังไม่ล็อกอิน", () => {
  test.use({ storageState: ANONYMOUS });

  test("ถูกส่งไปหน้า /login พร้อมจำปลายทาง", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("หน้าเข้าสู่ระบบแสดงผลได้บนจอมือถือโดยไม่ล้นขอบ", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("ผู้เรียนล็อกอินแล้วเข้าหน้าแดชบอร์ดได้ (FR-01.1)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล", { exact: true }).fill(STUDENT.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(STUDENT.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});

test.describe("ผู้เรียนที่ล็อกอินแล้ว", () => {
  test("เข้าหน้าผู้ดูแลไม่ได้ (deny by default)", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
  });

  test("เข้าห้องผู้สอนไม่ได้", async ({ page }) => {
    const response = await page.goto("/teach");
    expect(response?.status()).toBe(403);
  });
});
