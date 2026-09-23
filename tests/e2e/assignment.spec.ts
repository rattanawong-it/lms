import { expect, test, type Page } from "@playwright/test";
import { ANONYMOUS, STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M08 — งานที่ต้องส่ง (FR-08.1–08.5)
 *
 * เส้นทาง: ผู้สอนสร้างงานผูกบทเรียน → ผู้เรียนเห็นบนหน้าหลัก → ส่งข้อความ + PDF (ไฟล์ผิดชนิดถูกปฏิเสธ)
 * → บทนับว่าจบ → ผู้สอนเปิดไฟล์และส่งกลับให้แก้ → ผู้เรียนส่งใหม่ (ครั้งที่ 2) → ผู้สอนให้คะแนน
 * → ผู้เรียนเห็นคะแนน/ความเห็น และส่งเพิ่มไม่ได้ · คนนอก/ผู้เรียนเปิดไฟล์และหน้าตรวจไม่ได้
 * แต่ละ project ใช้คอร์สของตัวเอง (ผู้เรียนบัญชีเดียวกัน)
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สงานที่ต้องส่ง ${p} ${RUN_ID}`;
const slug = (p: string) => `e2e-assignment-${p}-${RUN_ID}`;
const assignmentTitle = (p: string) => `รายงานบทที่ 1 ${p} ${RUN_ID}`;
const LESSON = "ส่งรายงาน";
const ANSWER = "สรุปบทที่ 1 ตามที่ได้เรียน";
const RETURN_NOTE = "ขาดบทสรุปท้ายรายงาน กรุณาเพิ่ม";
const PDF = { name: "รายงาน.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e\n%%EOF\n") };

test.describe.configure({ mode: "serial" });

async function openCourse(page: Page, project: string) {
  await page.goto(teachSearch(courseTitle(project)));
  await page.getByRole("link", { name: courseTitle(project) }).first().click();
  await expect(page.getByRole("heading", { name: courseTitle(project), level: 1 })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}

async function openLesson(page: Page, project: string) {
  await page.goto(`/courses/${slug(project)}`);
  await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
  await expect(page.getByRole("heading", { name: LESSON, level: 1 })).toBeVisible({ timeout: 30_000 });
}

/** หน้าตรวจของงานที่ส่งล่าสุด (ผ่านคิวรอตรวจ) */
async function openFromQueue(page: Page, project: string) {
  const coursePath = await openCourse(page, project);
  await page.goto(`${coursePath}/assignments/review`);
  await page.locator("[data-queue-item]").filter({ hasText: assignmentTitle(project) }).getByRole("link", { name: "ตรวจ" }).click();
  await expect(page.getByRole("heading", { name: "ผลการตรวจ" })).toBeVisible({ timeout: 30_000 });
}

const form = (page: Page) => page.getByRole("form", { name: "ส่งงาน" });

test.describe("ผู้สอนสร้างงาน", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์ส บทงาน และงานที่ต้องส่ง (FR-08.1)", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/teach/courses/new");
    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(courseTitle(p));
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(slug(p));
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();
    await expect(page).toHaveURL(/\/curriculum/, { timeout: 30_000 });

    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill("บทที่ 1");
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    await expect(page.getByRole("heading", { name: /บทที่ 1/ })).toBeVisible();
    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill(LESSON);
    await page.getByLabel("ชนิดบทเรียน").click();
    await page.getByRole("option", { name: "งานที่ต้องส่ง" }).click();
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText(LESSON, { exact: true })).toBeVisible({ timeout: 15_000 });

    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/assignments/new`);
    await page.getByLabel("ชื่องาน", { exact: true }).fill(assignmentTitle(p));
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: LESSON }).click();
    const editor = page.locator('[contenteditable="true"][aria-label="คำสั่งงาน"]');
    await editor.click();
    await editor.pressSequentially("เขียนรายงานสรุปบทที่ 1 เป็น PDF");
    await page.getByLabel("คะแนนเต็ม").fill("10");
    await page.getByRole("button", { name: "สร้างงาน" }).click();
    await expect(page.getByText("สร้างงานแล้ว")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-assignment]").filter({ hasText: assignmentTitle(p) })).toContainText(
      `บทเรียน: ${LESSON}`,
    );

    await page.goto(coursePath);
    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("รอคณะอนุมัติ", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้ดูแล", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("อนุมัติคอร์ส", async ({ page }, info) => {
    await page.goto("/admin/courses");
    await page
      .getByRole("row", { name: new RegExp(courseTitle(info.project.name)) })
      .getByRole("link", { name: "ตรวจคอร์ส" })
      .click();
    await page.getByRole("button", { name: "อนุมัติและเผยแพร่" }).click();
    await expect(page.getByText("เผยแพร่แล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ส่งงาน → ส่งกลับ → ส่งใหม่ → ให้คะแนน", () => {
  test("ผู้เรียนอัปโหลดทั่วไปไม่ได้ (เฉพาะในบริบทของงาน)", async ({ page }) => {
    await page.goto("/dashboard");
    const response = await page.request.post("/api/upload/presign", {
      data: { kind: "FILE", mime: "application/pdf", size: 100, originalName: "x.pdf" },
    });
    expect(response.status()).toBe(403);
  });

  test("ลงทะเบียน · งานขึ้นบนหน้าหลัก · ส่งข้อความ + PDF (FR-08.2 · FR-08.5)", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/courses/${slug(p)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({ timeout: 30_000 });

    await page.goto("/dashboard");
    await expect(page.locator("[data-due-assignment]").filter({ hasText: assignmentTitle(p) })).toBeVisible({
      timeout: 30_000,
    });

    await openLesson(page, p);
    await expect(page.getByText("เขียนรายงานสรุปบทที่ 1 เป็น PDF")).toBeVisible();
    await expect(page.getByText("บทนี้นับว่าเรียนจบเมื่อส่งงาน")).toBeVisible();
    await expect(page.getByRole("button", { name: "เรียนจบบทนี้" })).toHaveCount(0);

    // ชนิดที่งานไม่รับถูกปฏิเสธตั้งแต่ฝั่งเบราว์เซอร์
    await form(page).getByLabel("เลือกไฟล์ที่จะส่ง").setInputFiles({
      name: "รูป.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    await expect(page.getByText("รูป.png: งานนี้รับเฉพาะไฟล์ .pdf, .docx, .zip")).toBeVisible();

    await form(page).getByLabel("เลือกไฟล์ที่จะส่ง").setInputFiles(PDF);
    await expect(form(page).locator("[data-attached-file]")).toContainText(PDF.name, { timeout: 30_000 });
    await form(page).getByLabel("คำตอบ / ข้อความถึงผู้สอน").fill(ANSWER);
    await form(page).getByRole("button", { name: "ส่งงาน" }).click();
    await expect(page.getByText("ส่งงานแล้ว", { exact: true })).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("[data-submission]")).toHaveCount(1);
    await expect(page.getByText("เรียนจบแล้ว").first()).toBeVisible();
    await expect(page.getByText("รอตรวจ").first()).toBeVisible();
  });

  test("ผู้สอนเห็นในคิว เปิดไฟล์ได้ แล้วส่งกลับให้แก้ (FR-08.4 · FR-08.5)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();

    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/assignments`);
    await expect(page.locator("[data-assignment]").filter({ hasText: assignmentTitle(p) })).toContainText("รอตรวจ 1");

    await openFromQueue(page, p);
    await expect(page.locator("[data-submission-text]")).toHaveText(ANSWER);
    const fileLink = page.getByRole("link", { name: `เปิดไฟล์ ${PDF.name}` });
    const href = await fileLink.getAttribute("href");
    // ผู้สอนของคอร์ส → redirect ไป signed URL
    const opened = await page.request.get(href!, { maxRedirects: 0 });
    expect(opened.status()).toBe(302);

    // ส่งกลับต้องมีความเห็น
    await page.getByRole("button", { name: "ส่งกลับให้แก้" }).click();
    await expect(page.getByText("บอกผู้เรียนว่าต้องแก้อะไร")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("ความเห็นถึงผู้เรียน").fill(RETURN_NOTE);
    await page.getByRole("button", { name: "ส่งกลับให้แก้" }).click();
    await expect(page.getByText("ส่งกลับให้แก้และแจ้งผู้เรียนแล้ว")).toBeVisible({ timeout: 15_000 });
    await context.close();

    // คนนอกเปิดไฟล์ไม่ได้ · ผู้เรียนเปิดหน้าตรวจของผู้สอนไม่ได้
    const anonymous = await browser.newContext({ storageState: ANONYMOUS });
    expect((await anonymous.request.get(href!, { maxRedirects: 0 })).status()).toBe(401);
    await anonymous.close();
    const student = await browser.newContext({ storageState: STATE_FILE.student });
    const response = await (await student.newPage()).goto(`${coursePath}/assignments/review`);
    expect(response?.status()).toBe(403);
    await student.close();
  });

  test("ผู้เรียนเห็นความเห็น แล้วส่งใหม่เป็นครั้งที่ 2", async ({ page }, info) => {
    const p = info.project.name;
    await openLesson(page, p);
    await expect(page.locator("[data-assignment-result]")).toContainText(RETURN_NOTE);

    // ไฟล์และข้อความเดิมติดมาให้ แก้เฉพาะส่วนที่ต้องแก้
    await expect(form(page).locator("[data-attached-file]")).toContainText(PDF.name);
    await form(page).getByLabel("คำตอบ / ข้อความถึงผู้สอน").fill(`${ANSWER} พร้อมบทสรุป`);
    await form(page).getByRole("button", { name: "ส่งงานอีกครั้ง" }).click();
    await expect(page.getByText("ส่งงานครั้งที่ 2 แล้ว")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-submission]")).toHaveCount(2);
  });

  test("ผู้สอนให้คะแนน → ผู้เรียนเห็นคะแนนและส่งเพิ่มไม่ได้", async ({ browser, page }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const teacher = await context.newPage();
    await openFromQueue(teacher, p);
    await expect(teacher.locator("[data-submission-text]")).toHaveText(`${ANSWER} พร้อมบทสรุป`);
    await teacher.getByLabel("คะแนน (เต็ม 10)").fill("8.5");
    await teacher.getByLabel("ความเห็นถึงผู้เรียน").fill("ดีมาก");
    await teacher.getByLabel("คะแนน (เต็ม 10)").press("Enter");
    await expect(teacher.getByText("บันทึกคะแนนและแจ้งผู้เรียนแล้ว")).toBeVisible({ timeout: 15_000 });
    await expect(teacher.locator("[data-submission-score]")).toHaveText("8.5/10");
    await context.close();

    await openLesson(page, p);
    await expect(page.locator("[data-assignment-score]")).toHaveText("8.5/10");
    await expect(page.locator("[data-assignment-result]")).toContainText("ดีมาก");
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByText("ผู้สอนตรวจงานนี้แล้ว")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.locator("[data-due-assignment]").filter({ hasText: assignmentTitle(p) })).toHaveCount(0);
  });
});
