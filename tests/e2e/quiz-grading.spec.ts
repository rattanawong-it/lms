import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M07 ขั้น 3 — ตรวจอัตนัย + ผลสอบ (FR-07.4)
 *
 * เส้นทาง: ผู้สอนสร้างแบบทดสอบที่มีข้ออัตนัย → ผู้เรียนส่ง → ค้าง "รอตรวจ"
 * → ผู้สอนเห็นในคิว ให้คะแนน + ความเห็น → ผู้เรียนได้แจ้งเตือน เห็นผลผ่านและความเห็น บทแบบทดสอบนับว่าจบ
 * แต่ละ project ใช้คอร์สของตัวเอง
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สตรวจอัตนัย ${p} ${RUN_ID}`;
const slug = (p: string) => `e2e-grading-${p}-${RUN_ID}`;
/** ผู้เรียนบัญชีเดียวกันทั้งสอง project — ชื่อต้องไม่ซ้ำ ไม่งั้นแจ้งเตือนของอีก project ปนกัน */
const quizTitle = (p: string) => `สอบอัตนัย ${p} ${RUN_ID}`;
const LESSON = "แบบทดสอบอัตนัย";
const ESSAY_ANSWER = "HTTPS เข้ารหัสข้อมูลด้วย TLS";
const FEEDBACK = "อธิบายถูกต้อง แต่ยังขาดเรื่องใบรับรอง";

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

const question = (page: Page, text: string) => page.locator("[data-quiz-question]").filter({ hasText: text });

test.describe("ผู้สอนเตรียมแบบทดสอบอัตนัย", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์ส บทแบบทดสอบ ข้อสอบ และแบบทดสอบ", async ({ page }, info) => {
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
    await page.getByRole("option", { name: "แบบทดสอบ" }).click();
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText(LESSON, { exact: true })).toBeVisible({ timeout: 15_000 });

    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/questions`);
    await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
    await page.getByLabel("เลือกไฟล์ข้อสอบ").setInputFiles({
      name: "q.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "ชนิด,โจทย์,ตัวเลือก,คำตอบ,คะแนน",
          "SINGLE,ข้อ-ปรนัย,ถูกต้อง|ผิดหนึ่ง,1,1",
          "ESSAY,ข้อ-อัตนัย,,,4",
        ].join("\n"),
      ),
    });
    await page.getByRole("button", { name: "นำเข้า 2 ข้อ" }).click();
    await expect(page.getByText("นำเข้าข้อสอบ 2 ข้อแล้ว")).toBeVisible({ timeout: 30_000 });

    await page.goto(`${coursePath}/quizzes/new`);
    await page.getByLabel("ชื่อแบบทดสอบ", { exact: true }).fill(quizTitle(p));
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: LESSON }).click();
    await page.getByLabel("คะแนนผ่าน (%)").fill("70");
    // ไม่เปิดเฉลย — คะแนนและความเห็นของข้ออัตนัยยังต้องเห็น (ไม่ใช่เฉลย)
    await page.getByLabel("แสดงเฉลยให้ผู้เรียน").click();
    await page.getByRole("option", { name: "ไม่แสดง" }).click();
    for (const prompt of ["ข้อ-ปรนัย", "ข้อ-อัตนัย"]) {
      await page.getByRole("button", { name: `เพิ่มข้อ: ${prompt}` }).click();
    }
    await page.getByRole("button", { name: "สร้างแบบทดสอบ" }).click();
    await expect(page.getByText("สร้างแบบทดสอบแล้ว")).toBeVisible({ timeout: 15_000 });

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

test.describe("ส่งแล้วรอตรวจ → ผู้สอนตรวจ → ผู้เรียนเห็นผล", () => {
  test("ผู้เรียนส่งคำตอบที่มีข้ออัตนัย → รอตรวจ", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/courses/${slug(p)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({ timeout: 30_000 });

    await openLesson(page, p);
    await page.getByRole("button", { name: "เริ่มทำแบบทดสอบ" }).click();
    await expect(page).toHaveURL(/\/quiz\/[a-z0-9]+$/, { timeout: 30_000 });

    await question(page, "ข้อ-ปรนัย").getByRole("radio", { name: "ถูกต้อง" }).check();
    await expect(question(page, "ข้อ-ปรนัย").getByText("บันทึกแล้ว")).toBeVisible();
    await question(page, "ข้อ-อัตนัย").getByRole("textbox").fill(ESSAY_ANSWER);
    await expect(question(page, "ข้อ-อัตนัย").getByText("บันทึกแล้ว")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "ส่งคำตอบ" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยันส่งคำตอบ" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "ส่งคำตอบแล้ว — รอผู้สอนตรวจข้ออัตนัย" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-quiz-score]")).toHaveText("1/5");
  });

  test("ผู้สอนเห็นในคิว ให้คะแนนและความเห็น (FR-07.4)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();
    const coursePath = await openCourse(page, p);

    await page.goto(`${coursePath}/quizzes`);
    await expect(page.locator("[data-quiz]").filter({ hasText: quizTitle(p) })).toContainText("รอตรวจ 1");
    await page.getByRole("link", { name: /ตรวจอัตนัย \(1\)/ }).click();
    await expect(page.getByRole("heading", { name: "ตรวจข้ออัตนัย", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-queue-item]")).toHaveCount(1);
    await expect(page.locator("[data-queue-item]")).toContainText("รอตรวจ 1 ข้อ");
    await page.locator("[data-queue-item]").getByRole("link", { name: "ตรวจ" }).click();

    await expect(page.locator("[data-attempt-score]")).toHaveText("1/5", { timeout: 30_000 });
    const essay = page.locator("[data-review-question]").filter({ hasText: "ข้อ-อัตนัย" });
    await expect(essay).toContainText(ESSAY_ANSWER);
    await expect(essay.getByText("รอตรวจ", { exact: true })).toBeVisible();

    await essay.getByLabel(/^คะแนนข้อ \d+ \(เต็ม 4\)$/).fill("3");
    await essay.getByLabel("ความเห็นถึงผู้เรียน (ไม่บังคับ)").fill(FEEDBACK);
    await essay.getByLabel(/^คะแนนข้อ \d+ \(เต็ม 4\)$/).press("Enter");
    await expect(page.getByText("บันทึกแล้ว — ตรวจครบทุกข้อและแจ้งผลผู้เรียนแล้ว")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-attempt-score]")).toHaveText("4/5");
    await expect(essay.getByText("ตรวจแล้ว", { exact: true })).toBeVisible();

    const reviewUrl = page.url();
    await page.goto(`${coursePath}/quizzes/review`);
    await expect(page.getByText("ตรวจครบแล้ว")).toBeVisible({ timeout: 30_000 });

    await page.goto(`${reviewUrl.replace(/\/attempts\/.*$/, "")}/results`);
    const row = page.locator("[data-student-result]");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("ผ่านแล้ว");
    await expect(row).toContainText("80%");
    await context.close();

    // ผู้เรียนเปิดหน้าตรวจของผู้สอนไม่ได้
    const student = await browser.newContext({ storageState: STATE_FILE.student });
    const response = await (await student.newPage()).goto(reviewUrl);
    expect(response?.status()).toBe(403);
    await student.close();
  });

  test("ผู้เรียนได้แจ้งเตือน เห็นผลผ่านและความเห็น · บทแบบทดสอบนับว่าจบ", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/notifications");
    await page
      .locator("[data-notification]")
      .filter({ hasText: `ผู้สอนตรวจแบบทดสอบ “${quizTitle(p)}” แล้ว` })
      .getByRole("link")
      .click();

    await expect(page.getByRole("heading", { name: "ผ่านแบบทดสอบ" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-quiz-score]")).toHaveText("4/5");
    const essay = page.locator("[data-result-question]").filter({ hasText: "ข้อ-อัตนัย" });
    await expect(essay).toContainText(FEEDBACK);
    await expect(essay).toContainText("ได้ 3");
    await expect(page.getByText("ผู้สอนตั้งค่าไม่แสดงเฉลยของแบบทดสอบนี้")).toBeVisible();

    await openLesson(page, p);
    await expect(page.getByText("สอบผ่านแล้ว")).toBeVisible();
  });
});
