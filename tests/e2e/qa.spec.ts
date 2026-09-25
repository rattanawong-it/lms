import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { runFixture } from "./helpers";
import type { QaFixture } from "./support/qa-fixture";

/**
 * M13 · FR-13.1–13.4 — ถาม-ตอบ (phase-3-plan ขั้น 4)
 *
 * ผู้เรียนถาม → ผู้สอนได้แจ้งเตือน → ตอบ + เลือกคำตอบที่ดีที่สุด → ผู้เรียนได้แจ้งเตือนและตอบซ้อน
 * → ถามจากหน้าเรียน → คนนอกคอร์สเข้าไม่ได้ → ผู้สอนซ่อนกระทู้ → สิทธิ์หมดอายุแล้วอ่านได้อย่างเดียว
 * คอร์สเตรียมตรงใน DB (ขั้นตอนสร้างคอร์สผ่าน UI มีเทสต์ของตัวเองแล้ว) · แยกคอร์สต่อ project
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สถาม-ตอบ ${p} ${RUN_ID}`;
const QUESTION = "ตัวแปรกับค่าคงที่ต่างกันอย่างไร";
const LESSON_QUESTION = "ตัวอย่างในบทนี้รันไม่ผ่าน";
const ANSWER = "ตัวแปรเปลี่ยนค่าได้ ส่วนค่าคงที่กำหนดครั้งเดียว";
const FOLLOW_UP = "เข้าใจแล้ว ขอบคุณครับ";
const DOC_LINK = "https://example.com/docs";

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, QaFixture>();
const threadUrls = new Map<string, string>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("qa-fixture.ts", "cleanup", f);
});

const threadArticle = (page: Page) => page.locator('article[aria-labelledby="qa-thread-title"]');

test("เตรียมคอร์ส", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<QaFixture>("qa-fixture.ts", "setup", {
      tag: `${p}-${RUN_ID}`,
      courseTitle: courseTitle(p),
      instructorEmail: ACCOUNTS.instructor.email,
      studentEmail: ACCOUNTS.student.email,
    }),
  );
});

test.describe("ผู้เรียนตั้งคำถาม", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ข้อความว่างถูกปฏิเสธ · ตั้งคำถามแล้วไปหน้ากระทู้ ลิงก์คลิกได้ (FR-13.1)", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/learn/${f.courseId}/qa`);
    await expect(page.getByRole("heading", { name: "ถาม-ตอบ", level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "ถามคำถาม" }).click();

    await page.getByLabel("หัวข้อคำถาม").fill(QUESTION);
    await page.getByLabel("รายละเอียด").fill("   ");
    await page.getByRole("button", { name: "ตั้งคำถาม" }).click();
    await expect(page.getByText("กรุณาเขียนรายละเอียดคำถาม")).toBeVisible();

    await page.getByLabel("รายละเอียด").fill(`อ่านจาก ${DOC_LINK} แล้วยังไม่เข้าใจ\n<b>ไม่ใช่ตัวหนา</b>`);
    await page.getByRole("button", { name: "ตั้งคำถาม" }).click();
    await expect(page.getByRole("heading", { name: QUESTION, level: 1 })).toBeVisible({ timeout: 30_000 });
    threadUrls.set(info.project.name, new URL(page.url()).pathname);

    const link = threadArticle(page).getByRole("link", { name: DOC_LINK });
    await expect(link).toHaveAttribute("rel", /nofollow/);
    await expect(threadArticle(page).getByText("<b>ไม่ใช่ตัวหนา</b>")).toBeVisible();
  });
});

test.describe("ผู้สอนตอบ", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ได้แจ้งเตือน · เห็นในกล่องคำถาม · ตอบและเลือกคำตอบที่ดีที่สุด (FR-13.3, 13.4)", async ({ page }, info) => {
    const p = info.project.name;
    const f = fixtures.get(p)!;
    await page.goto("/notifications");
    await expect(page.getByText(`คำถามใหม่ในคอร์ส “${courseTitle(p)}”`)).toBeVisible({ timeout: 30_000 });

    await page.goto(`/teach/courses/${f.courseId}/qa`);
    await page.getByRole("link", { name: new RegExp(QUESTION) }).click();
    await expect(page.getByRole("heading", { name: QUESTION, level: 1 })).toBeVisible({ timeout: 30_000 });

    const form = page.getByRole("form", { name: "เขียนคำตอบ" });
    await form.getByRole("textbox").fill(ANSWER);
    await form.getByRole("button", { name: "ส่งคำตอบ" }).click();
    const answer = page.locator("[data-qa-post]").filter({ hasText: ANSWER });
    await expect(answer).toBeVisible({ timeout: 15_000 });
    await expect(answer.getByText("ผู้สอน", { exact: true })).toBeVisible();

    await answer.getByRole("button", { name: "เลือกเป็นคำตอบที่ดีที่สุด" }).click();
    await expect(page.locator("[data-answer]").getByText("คำตอบที่ดีที่สุด", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-qa-resolved]")).toBeVisible();
  });
});

test.describe("ผู้เรียนเห็นคำตอบ", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ได้แจ้งเตือน · เห็นคำตอบที่ดีที่สุด · ตอบซ้อนได้ (FR-13.2)", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/notifications");
    const notice = page.getByRole("link", { name: new RegExp(`ตอบในกระทู้ “${QUESTION}”`) }).first();
    await expect(notice).toBeVisible({ timeout: 30_000 });

    await page.goto(threadUrls.get(p)!);
    const best = page.locator("[data-answer]");
    await expect(best).toContainText(ANSWER, { timeout: 30_000 });
    await best.getByRole("button", { name: "ตอบกลับ" }).click();
    const reply = page.getByRole("form", { name: /^ตอบกลับ / });
    await reply.getByRole("textbox").fill(FOLLOW_UP);
    await reply.getByRole("button", { name: "ส่งคำตอบ" }).click();
    // คำตอบย่อยอยู่ภายในคำตอบที่ถูกตอบ
    await expect(best.locator("[data-qa-post]").filter({ hasText: FOLLOW_UP })).toBeVisible({ timeout: 15_000 });
  });

  test("ถามจากหน้าเรียน — กระทู้ผูกกับบทเรียนนั้น", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/learn/${f.courseId}/${f.lessonId}`);
    const section = page.getByRole("region", { name: /ถาม-ตอบในบทนี้/ });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await section.getByRole("button", { name: "ถามคำถาม" }).click();
    await section.getByLabel("หัวข้อคำถาม").fill(LESSON_QUESTION);
    await section.getByLabel("รายละเอียด").fill("ขึ้นข้อความ error ตอนรันตัวอย่างที่ 2");
    await section.getByRole("button", { name: "ตั้งคำถาม" }).click();
    await expect(section.locator("[data-qa-thread]").filter({ hasText: LESSON_QUESTION })).toBeVisible({ timeout: 15_000 });

    await page.goto(`/learn/${f.courseId}/qa?filter=all&lesson=${f.lessonId}`);
    await expect(page.locator("[data-qa-thread]").filter({ hasText: LESSON_QUESTION })).toBeVisible({ timeout: 30_000 });
    await page.goto(`/learn/${f.courseId}/qa?filter=unanswered`);
    await expect(page.locator("[data-qa-thread]").filter({ hasText: QUESTION })).toHaveCount(0, { timeout: 30_000 });
  });
});

test.describe("คนนอกคอร์ส", () => {
  test.use({ storageState: STATE_FILE.deptAdmin });

  test("ผู้ดูแลคณะอื่นที่ไม่ได้ลงทะเบียนเปิดกระดานและกระทู้ไม่ได้", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto(`/learn/${f.courseId}/qa`);
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึงหน้านี้" })).toBeVisible({ timeout: 30_000 });
    await page.goto(threadUrls.get(info.project.name)!);
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึงหน้านี้" })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("ผู้สอนซ่อนกระทู้", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("ซ่อนแล้วติดป้าย", async ({ page }, info) => {
    await page.goto(threadUrls.get(info.project.name)!);
    await threadArticle(page).getByRole("button", { name: "ซ่อน", exact: true }).click();
    await expect(page.getByText("ถูกซ่อน — ผู้เรียนคนอื่นไม่เห็น")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้เรียนหลังถูกซ่อน/หมดอายุ", () => {
  test.use({ storageState: STATE_FILE.student });

  test("เจ้าของยังเห็นกระทู้ที่ถูกซ่อนแต่ตอบเพิ่มไม่ได้", async ({ page }, info) => {
    await page.goto(threadUrls.get(info.project.name)!);
    await expect(page.getByText("กระทู้นี้ถูกซ่อนแล้ว ตอบเพิ่มไม่ได้")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("form", { name: "เขียนคำตอบ" })).toHaveCount(0);
  });

  test("สิทธิ์หมดอายุ → อ่านได้อย่างเดียว", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    runFixture("qa-fixture.ts", "expire", f);
    await page.goto(`/learn/${f.courseId}/qa?filter=all`);
    await expect(page.getByText(/อ่านกระทู้ได้แต่ตั้งคำถามหรือตอบไม่ได้/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "ถามคำถาม" })).toHaveCount(0);
    await expect(page.locator("[data-qa-thread]").filter({ hasText: LESSON_QUESTION })).toBeVisible();
  });
});
