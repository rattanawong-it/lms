import { expect, test } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { findMail, runFixture, teachSearch } from "./helpers";
import type { Phase3Fixture } from "./support/phase3-fixture";

/**
 * ปิด Phase 3 — เส้นทางข้ามบทบาท (phase-3-plan ขั้น 7)
 * ผู้เรียนถาม → ผู้สอนได้อีเมล · แดชบอร์ดเห็นคำถามค้าง → ตอบ → ผู้เรียนได้แจ้งเตือนแล้วรีวิว → ผู้ดูแลเห็นใน audit
 * แต่ละ project ใช้คอร์สของตัวเอง · อีเมลของผู้สอนเปิดเฉพาะ desktop (การตั้งค่าเป็นของบัญชีร่วม)
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สปิดเฟส 3 ${p} ${RUN_ID}`;
const QUESTION = `ขอตัวอย่างเพิ่มเติม ${RUN_ID}`;
const ANSWER = "ดูตัวอย่างที่ 3 ในบทนำได้เลยครับ";
const COMMENT = `ผู้สอนตอบคำถามเร็วมาก ${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, Phase3Fixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("phase3-fixture.ts", "cleanup", f);
});

test("เตรียมคอร์ส", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<Phase3Fixture>("phase3-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      courseTitle: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
      emailPrefs: p === "desktop",
    }),
  );
});

test.describe("ผู้เรียนถาม", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ตั้งคำถามในคอร์ส", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/learn/${f.courseId}/qa`);
    await page.getByRole("button", { name: "ถามคำถาม" }).click();
    await page.getByLabel("หัวข้อคำถาม").fill(QUESTION);
    await page.getByLabel("รายละเอียด").fill("อยากเห็นตัวอย่างที่ใช้กับงานจริง");
    await page.getByRole("button", { name: "ตั้งคำถาม" }).click();
    await expect(page.getByRole("heading", { name: QUESTION, level: 1 })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("ผู้สอนตอบ", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ได้อีเมลแจ้งคำถามใหม่ (FR-11.3/11.4)", async ({}, info) => {
    test.skip(info.project.name !== "desktop", "เปิดอีเมลของผู้สอนเฉพาะ desktop");
    await expect
      .poll(() => findMail(ACCOUNTS.instructor.email, `คำถามใหม่ในคอร์ส “${courseTitle(info.project.name)}”`).then((m) => m.length), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
  });

  test("แดชบอร์ดเห็นคำถามค้าง 1 → ตอบ → เหลือ 0 (FR-16.2)", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(teachSearch(courseTitle(p)));
    const row = page.getByRole("row").filter({ hasText: courseTitle(p) });
    const open = row.getByRole("link", { name: "1", exact: true });
    await expect(open).toHaveAttribute("href", /\/qa$/, { timeout: 30_000 });

    await open.click();
    await page.getByRole("link", { name: new RegExp(QUESTION) }).click();
    const form = page.getByRole("form", { name: "เขียนคำตอบ" });
    await form.getByRole("textbox").fill(ANSWER);
    await form.getByRole("button", { name: "ส่งคำตอบ" }).click();
    await expect(page.getByText(ANSWER)).toBeVisible({ timeout: 15_000 });

    await page.goto(teachSearch(courseTitle(p)));
    await expect(page.getByRole("row").filter({ hasText: courseTitle(p) }).getByRole("link", { name: "1", exact: true })).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});

test.describe("ผู้เรียนรีวิว", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ได้แจ้งเตือนคำตอบ แล้วรีวิวคอร์ส (FR-13.3 · FR-14.1)", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: new RegExp(`ตอบในกระทู้ “${QUESTION}”`) }).first()).toBeVisible({ timeout: 30_000 });

    await page.goto(`/courses/${f.slug}`);
    const form = page.getByRole("form", { name: "รีวิวของฉัน" });
    await form.getByLabel("5 ดาว — ดีมาก").check({ force: true });
    await form.getByLabel("ความคิดเห็น (ไม่บังคับ)").fill(COMMENT);
    await form.getByRole("button", { name: "ส่งรีวิว" }).click();
    await expect(page.getByText("คุณให้ 5 ดาว กับคอร์สนี้แล้ว", { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้ดูแลระบบตรวจย้อนหลัง", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("เห็นการตั้งคำถามและรีวิวใน audit (FR-17.1/17.2)", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/admin/audit?${new URLSearchParams({ q: ACCOUNTS.student.email, action: "qa.thread.create" })}`);
    // ค่าก่อน/หลังอยู่ใน <details> ที่ยังปิด — กรองด้วยข้อความในนั้นได้ แล้วกางดู
    const thread = page.locator('[data-audit-row="qa.thread.create"]').filter({ hasText: f.courseId });
    await expect(thread).toHaveCount(1, { timeout: 30_000 });
    await thread.locator("summary").click();
    await expect(thread.getByText(QUESTION)).toBeVisible();

    await page.goto(`/admin/audit?${new URLSearchParams({ q: ACCOUNTS.student.email, action: "review.create" })}`);
    const review = page.locator('[data-audit-row="review.create"]').filter({ hasText: COMMENT });
    await review.locator("summary").click();
    await expect(review.getByText(COMMENT)).toBeVisible();
  });
});
