import { expect, test, type Page } from "@playwright/test";
import { ANONYMOUS } from "./constants";

/**
 * M03 — คลังคอร์สและหน้ารายละเอียด (ใช้คอร์สจาก prisma/seed.ts)
 * seed มีคอร์ส PUBLIC 2 รายการ และ INTERNAL 3 รายการ
 */
function courseLinks(page: Page) {
  return page.locator('a[href^="/courses/"]');
}

async function linkedSlugs(page: Page) {
  return courseLinks(page).evaluateAll((nodes) => [
    ...new Set(nodes.map((n) => n.getAttribute("href"))),
  ]);
}

test.describe("ผู้เยี่ยมชมที่ยังไม่ล็อกอิน", () => {
  test.use({ storageState: ANONYMOUS });

  test("เห็นเฉพาะคอร์สสาธารณะ (FR-03.4)", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "คลังคอร์ส", level: 1 })).toBeVisible();

    const slugs = await linkedSlugs(page);
    expect(slugs).toContain("/courses/data-analysis-basics");
    expect(slugs).not.toContain("/courses/academic-writing");
  });

  test("คอร์สภายในตอบ 404 และไม่เปิดเผยชื่อคอร์ส", async ({ page }) => {
    const response = await page.goto("/courses/academic-writing");
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: "ไม่พบหน้าที่ต้องการ" })).toBeVisible();
    await expect(page).not.toHaveTitle(/การเขียนเชิงวิชาการ/);
    expect(await page.content()).not.toContain("การเขียนเชิงวิชาการ");
  });

  test("query string ที่ผิดรูปไม่ทำให้หน้าพัง", async ({ page }) => {
    const response = await page.goto("/courses?sort=garbage&page=-1");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "คลังคอร์ส", level: 1 })).toBeVisible();
  });
});

test.describe("ผู้เรียนที่ล็อกอินแล้ว", () => {
  test("เห็นคอร์สภายในและเปิดหน้ารายละเอียดได้ (FR-03.3)", async ({ page }) => {
    const response = await page.goto("/courses/academic-writing");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "การเขียนเชิงวิชาการและการอ้างอิง", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "สารบัญบทเรียน" })).toBeVisible();
  });

  test("ค้นหาและกรองด้วย query string ได้ (FR-03.2)", async ({ page }) => {
    await page.goto("/courses?q=การตลาด");
    await expect(courseLinks(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /การตลาดดิจิทัล/ })).toBeVisible();

    await page.goto("/courses?category=general");
    await expect(courseLinks(page)).toHaveCount(2);

    await page.goto("/courses?q=ไม่มีคอร์สชื่อนี้แน่นอน");
    await expect(page.getByText("ไม่พบคอร์สตามเงื่อนไขที่เลือก")).toBeVisible();
  });

  test("เข้าหน้าจัดการหมวดหมู่ไม่ได้ (FR-03.1 · §4.1)", async ({ page }) => {
    const response = await page.goto("/admin/categories");
    expect(response?.status()).toBe(403);
  });
});
