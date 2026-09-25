import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { ReviewsFixture } from "./support/reviews-fixture";

/**
 * M14 · FR-14.1–14.3 — รีวิวและคะแนน (phase-3-plan ขั้น 5)
 *
 * เรียนยังไม่ถึง 30% รีวิวไม่ได้ → ถึงแล้วรีวิว 4 ดาว → ค่าเฉลี่ยใน catalog 2.0 → 3.0
 * → ผู้สอนได้แจ้งเตือนและตอบกลับ → แอดมินซ่อน → ค่าเฉลี่ยกลับเป็น 2.0 · แยกคอร์สต่อ project
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สรีวิว ${p} ${RUN_ID}`;
const COMMENT = "ตัวอย่างชัดเจน ทำตามได้ทันที";
const REPLY = "ขอบคุณสำหรับรีวิวครับ";

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, ReviewsFixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("reviews-fixture.ts", "cleanup", f);
});

async function expectCatalogAverage(page: Page, title: string, avg: string, count: number) {
  await page.goto(`/courses?q=${encodeURIComponent(title)}`);
  const card = page.getByRole("article").filter({ hasText: title });
  await expect(card.getByText(`คะแนนเฉลี่ย ${avg} จาก 5`)).toBeAttached({ timeout: 30_000 });
  await expect(card.getByText(`(${count})`)).toBeVisible();
}

test("เตรียมคอร์ส", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<ReviewsFixture>("reviews-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      courseTitle: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
    }),
  );
});

test.describe("ผู้เรียนรีวิว", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ยังไม่ถึง 30% รีวิวไม่ได้ · ถึงแล้วให้ 4 ดาวพร้อมความคิดเห็น (FR-14.1)", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto(`/courses/${f.slug}`);
    await expect(page.getByText(/รีวิวได้เมื่อเรียนไปแล้วอย่างน้อย 30% · ตอนนี้คุณเรียนไปแล้ว/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("form", { name: "รีวิวของฉัน" })).toHaveCount(0);
    await expectCatalogAverage(page, courseTitle(p), "2.0", 1);

    runFixture("reviews-fixture.ts", "setProgress", { ...f, pct: 40 });
    await page.goto(`/courses/${f.slug}`);
    const form = page.getByRole("form", { name: "รีวิวของฉัน" });
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByRole("button", { name: "ส่งรีวิว" }).click();
    await expect(form.getByText("กรุณาเลือกจำนวนดาว 1–5")).toBeVisible();

    await form.getByLabel("4 ดาว — ดี").check({ force: true });
    await form.getByLabel("ความคิดเห็น (ไม่บังคับ)").fill(COMMENT);
    await form.getByRole("button", { name: "ส่งรีวิว" }).click();
    await expect(page.getByText("คุณให้ 4 ดาว กับคอร์สนี้แล้ว", { exact: false })).toBeVisible({ timeout: 15_000 });

    const mine = page.locator("[data-review]").filter({ hasText: COMMENT });
    await expect(mine.getByText("รีวิวของคุณ")).toBeVisible();
    await expect(page.locator("[data-rating-avg]")).toHaveText("3.0");
    await expectCatalogAverage(page, courseTitle(p), "3.0", 2);
  });
});

test.describe("ผู้สอนตอบกลับ", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ได้แจ้งเตือนรีวิวใหม่ · ตอบกลับได้ (FR-14.3)", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto("/notifications");
    await expect(page.getByText(`มีรีวิวใหม่ 4 ดาว ในคอร์ส “${courseTitle(p)}”`)).toBeVisible({ timeout: 30_000 });

    await page.goto(`/courses/${f.slug}`);
    const review = page.locator("[data-review]").filter({ hasText: COMMENT });
    await review.getByRole("button", { name: "ตอบกลับ" }).click();
    await review.getByLabel("คำตอบกลับของผู้สอน").fill(REPLY);
    await review.getByRole("button", { name: "บันทึกคำตอบกลับ" }).click();
    await expect(review.locator("[data-review-reply]")).toContainText(REPLY, { timeout: 15_000 });
    // ผู้สอนซ่อนรีวิวไม่ได้ (เฉพาะผู้ดูแล)
    await expect(review.getByRole("button", { name: "ซ่อนรีวิว" })).toHaveCount(0);
  });
});

test.describe("ผู้ดูแลซ่อนรีวิว", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("ซ่อนที่ /admin/reviews → ค่าเฉลี่ยกลับเป็นค่าเดิม", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/admin/reviews?q=${encodeURIComponent(courseTitle(p))}`);
    const row = page.locator("[data-admin-review]").filter({ hasText: COMMENT });
    await row.getByRole("button", { name: "ซ่อนรีวิว" }).click();
    await expect(row.getByText("ถูกซ่อน", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expectCatalogAverage(page, courseTitle(p), "2.0", 1);
  });
});

test.describe("ผู้เรียนหลังรีวิวถูกซ่อน", () => {
  test.use({ storageState: STATE_FILE.student });

  test("รีวิวที่ถูกซ่อนหายจากรายการ · ไม่นับในค่าเฉลี่ย · เจ้าของเห็นข้อความแจ้ง", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/courses/${f.slug}`);
    await expect(page.locator("[data-rating-avg]")).toHaveText("2.0", { timeout: 30_000 });
    await expect(page.locator("[data-review]").filter({ hasText: COMMENT })).toHaveCount(0);
    await expect(page.getByText("ผู้ดูแลซ่อนรีวิวนี้ไว้", { exact: false })).toBeVisible();
  });
});
