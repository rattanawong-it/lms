import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M07 ขั้น 2 — แบบทดสอบ (FR-07.3 · FR-07.4 · FR-07.5 · FR-07.6)
 *
 * แต่ละ project สร้างคอร์สของตัวเอง (ผู้เรียนบัญชีเดียวกันทำพร้อมกันได้โดยไม่แย่งจำนวนครั้ง)
 * เส้นทาง: ผู้สอนนำเข้าข้อสอบ → สร้างแบบทดสอบผูกบทเรียน → อนุมัติ → ผู้เรียนสอบไม่ผ่าน
 * → หมดเวลาแล้วระบบส่งเอง → สอบผ่าน → บทเรียนและคอร์สนับว่าจบ → ครบจำนวนครั้ง
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สแบบทดสอบ ${p} ${RUN_ID}`;
const slug = (p: string) => `e2e-quiz-${p}-${RUN_ID}`;
const QUIZ_TITLE = "สอบท้ายบท";
const LESSON = "แบบทดสอบบทที่ 1";
/** คำตอบของข้อเติมคำ — ต้องไม่หลุดไปถึงเบราว์เซอร์ระหว่างสอบ */
const secretOf = (p: string) => `คำตอบลับ${p}${RUN_ID}`;

test.describe.configure({ mode: "serial" });
// เทสต์เตรียมคอร์ส/ตรวจงานเปิดหลายหน้าต่อกัน — งบ 30 วินาทีตั้งต้นไม่พอบนเครื่องพัฒนา (CLAUDE.md §6)
test.slow();

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

async function startQuiz(page: Page, project: string) {
  await openLesson(page, project);
  await page.getByRole("button", { name: /เริ่มทำแบบทดสอบ|ทำอีกครั้ง/ }).click();
  await expect(page).toHaveURL(/\/quiz\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.locator("[data-quiz-question]")).toHaveCount(3);
}

const question = (page: Page, text: string) => page.locator("[data-quiz-question]").filter({ hasText: text });

async function answer(page: Page, project: string, correct: boolean) {
  await question(page, "ข้อ-ปรนัย").getByRole("radio", { name: correct ? "ถูกต้อง" : "ผิดหนึ่ง" }).check();
  await expect(question(page, "ข้อ-ปรนัย").getByText("บันทึกแล้ว")).toBeVisible();
  await question(page, "ข้อ-ถูกผิด").getByRole("radio", { name: correct ? "ถูก" : "ผิด", exact: true }).check();
  await expect(question(page, "ข้อ-ถูกผิด").getByText("บันทึกแล้ว")).toBeVisible();
  await question(page, "ข้อ-เติมคำ").getByRole("textbox").fill(correct ? secretOf(project) : "ไม่รู้");
  await expect(question(page, "ข้อ-เติมคำ").getByText("บันทึกแล้ว")).toBeVisible({ timeout: 10_000 });
}

async function submit(page: Page) {
  await page.getByRole("button", { name: "ส่งคำตอบ" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "ยืนยันส่งคำตอบ" }).focus();
  await page.keyboard.press("Enter");
}

test.describe("ผู้สอนเตรียมแบบทดสอบ", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์สที่มีบทชนิดแบบทดสอบ", async ({ page }, info) => {
    await page.goto("/teach/courses/new");
    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(courseTitle(info.project.name));
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(slug(info.project.name));
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();
    await expect(page).toHaveURL(/\/curriculum/, { timeout: 30_000 });

    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill("บทที่ 1");
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    await expect(page.getByRole("heading", { name: /บทที่ 1/ })).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill(LESSON);
    await page.getByLabel("ชนิดบทเรียน").click();
    await page.getByRole("option", { name: "แบบทดสอบ" }).click();
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText(LESSON, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("นำเข้าข้อสอบ แล้วสร้างแบบทดสอบผูกกับบทเรียน (FR-07.3)", async ({ page }, info) => {
    const p = info.project.name;
    const coursePath = await openCourse(page, p);

    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("q").addRows([
      ["ชนิด", "โจทย์", "ตัวเลือก", "คำตอบ", "คะแนน"],
      ["SINGLE", "ข้อ-ปรนัย", "ถูกต้อง|ผิดหนึ่ง|ผิดสอง", "1", "1"],
      ["TRUE_FALSE", "ข้อ-ถูกผิด", "", "ถูก", "1"],
      ["SHORT_TEXT", "ข้อ-เติมคำ", "", secretOf(p), "1"],
    ]);
    await page.goto(`${coursePath}/questions`);
    await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
    await page.getByLabel("เลือกไฟล์ข้อสอบ").setInputFiles({
      name: "q.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await page.getByRole("button", { name: "นำเข้า 3 ข้อ" }).click();
    await expect(page.getByText("นำเข้าข้อสอบ 3 ข้อแล้ว")).toBeVisible({ timeout: 30_000 });

    await page.goto(`${coursePath}/quizzes/new`);
    await page.getByLabel("ชื่อแบบทดสอบ", { exact: true }).fill(QUIZ_TITLE);
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: LESSON }).click();
    await page.getByLabel("เวลาทำ (นาที)").fill("30");
    await page.getByLabel("ทำได้กี่ครั้ง").fill("3");
    await page.getByLabel("แสดงเฉลยให้ผู้เรียน").click();
    await page.getByRole("option", { name: "ทันทีหลังส่ง" }).click();
    for (const prompt of ["ข้อ-ปรนัย", "ข้อ-ถูกผิด", "ข้อ-เติมคำ"]) {
      await page.getByRole("button", { name: `เพิ่มข้อ: ${prompt}` }).click();
    }
    await expect(page.locator("[data-selected-question]")).toHaveCount(3);
    await page.getByRole("button", { name: "สร้างแบบทดสอบ" }).click();
    await expect(page.getByText("สร้างแบบทดสอบแล้ว")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-quiz]").filter({ hasText: QUIZ_TITLE })).toContainText(`บทเรียน: ${LESSON}`);

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

test.describe("ผู้เรียนทำแบบทดสอบ", () => {
  test("ลงทะเบียน แล้วบทแบบทดสอบติ๊กจบเองไม่ได้", async ({ page }, info) => {
    await page.goto(`/courses/${slug(info.project.name)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({ timeout: 30_000 });

    await openLesson(page, info.project.name);
    await expect(page.getByRole("heading", { name: QUIZ_TITLE })).toBeVisible();
    await expect(page.getByRole("button", { name: "เรียนจบบทนี้" })).toHaveCount(0);
    await expect(page.getByText("บทนี้นับว่าเรียนจบเมื่อสอบผ่านแบบทดสอบ")).toBeVisible();
  });

  test("ครั้งที่ 1: ตอบผิดแล้วส่ง → ไม่ผ่าน · เฉลยไม่หลุดระหว่างสอบ (FR-07.4 · FR-07.6)", async ({ page }, info) => {
    const p = info.project.name;
    await startQuiz(page, p);

    // HTML ตั้งต้น (รวม RSC payload) ของหน้าที่กำลังสอบต้องไม่มีเฉลย
    const html = await (await page.request.get(page.url())).text();
    expect(html).not.toContain(secretOf(p));
    expect(html).not.toContain("isCorrect");
    expect(html).not.toContain("matchKey");

    await answer(page, p, false);
    await submit(page);
    await expect(page.getByRole("heading", { name: "ยังไม่ผ่านเกณฑ์" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-quiz-score]")).toHaveText("0/3");
    // เฉลยแสดงทันทีตามการตั้งค่า
    await expect(page.getByText(`คำตอบที่ยอมรับ: ${secretOf(p)}`)).toBeVisible();
  });

  test("ครั้งที่ 2: หมดเวลาแล้วระบบส่งให้เอง (FR-07.5)", async ({ page }, info) => {
    await page.clock.install();
    await startQuiz(page, info.project.name);
    await expect(page.getByRole("timer")).toContainText(/2\d:\d\d|30:00/);

    await page.clock.fastForward("30:05");
    await expect(page.getByRole("heading", { name: "ยังไม่ผ่านเกณฑ์" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("ครั้งที่ 2", { exact: false }).first()).toBeVisible();
  });

  test("ครั้งที่ 3: ตอบถูกทั้งหมด → ผ่าน · บทเรียนและคอร์สนับว่าจบ", async ({ page }, info) => {
    const p = info.project.name;
    await startQuiz(page, p);
    await answer(page, p, true);
    await submit(page);
    await expect(page.getByRole("heading", { name: "ผ่านแบบทดสอบ" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-quiz-score]")).toHaveText("3/3");

    await openLesson(page, p);
    await expect(page.getByText("สอบผ่านแล้ว")).toBeVisible();
    await expect(page.getByText("เรียนจบแล้ว").first()).toBeVisible();
    await expect(page.locator("[data-attempt]")).toHaveCount(3);
    // ใช้สิทธิ์ครบ 3 ครั้งแล้ว
    await expect(page.getByRole("button", { name: "ทำอีกครั้ง" })).toBeDisabled();
    await expect(page.getByText("ใช้สิทธิ์ทำครบจำนวนครั้งแล้ว")).toBeVisible();

    await page.goto("/my-courses");
    await page.getByRole("tab", { name: /เรียนจบ/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: courseTitle(p) }).first()).toBeVisible();
  });

  test("ผู้ใช้อื่นเปิด attempt ของคนอื่นไม่ได้", async ({ browser }, info) => {
    const student = await browser.newContext({ storageState: STATE_FILE.student });
    const page = await student.newPage();
    await openLesson(page, info.project.name);
    const href = await page.locator("[data-attempt]").first().getByRole("link").getAttribute("href");
    await student.close();

    const instructor = await browser.newContext({ storageState: STATE_FILE.instructor });
    const other = await instructor.newPage();
    const response = await other.goto(href!);
    expect(response?.status()).toBe(403);
    await instructor.close();
  });
});
