import { expect, test, type Page } from "@playwright/test";
import { ANONYMOUS, STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * ปิด Phase 2 — M07 + M08 + M09 + M10 ต่อกันทั้งเส้น (phase-2-plan ขั้น 6)
 *
 * ผู้สอนสร้างคอร์สที่มีแบบทดสอบ + งาน · ตั้งน้ำหนัก 50/50 และคะแนนรวมขั้นต่ำ 60 · ตั้งแม่แบบใบประกาศ
 * → ผู้เรียนสอบผ่าน + ส่งงาน (เรียนครบ 100% แต่คะแนนรวม 50 ยังไม่จบ)
 * → ผู้สอนให้คะแนนงาน 8/10 → คะแนนรวม 90 → จบคอร์ส → ได้ใบประกาศ + แจ้งเตือน
 * → ดาวน์โหลด PDF · เปิด /verify/[code] แบบไม่ล็อกอิน → ผู้ดูแลเพิกถอน → หน้า verify ขึ้น "ถูกเพิกถอน"
 * แต่ละ project ใช้คอร์สของตัวเอง (ผู้เรียนบัญชีเดียวกัน)
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const courseTitle = (p: string) => `คอร์สปิดเฟสสอง ${p} ${RUN_ID}`;
const slug = (p: string) => `e2e-phase2-${p}-${RUN_ID}`;
const QUIZ = "แบบทดสอบท้ายบท";
const QUIZ_LESSON = "ทำแบบทดสอบ";
const WORK = "งานท้ายบท";
const WORK_LESSON = "ส่งงาน";
const SIGNER = "ผศ.ดร.ผู้ลงนาม ทดสอบ";

test.describe.configure({ mode: "serial" });

/** รหัสใบประกาศของแต่ละ project — ใช้ต่อข้ามเทสต์ใน describe แบบ serial */
const codes = new Map<string, string>();

async function openCourse(page: Page, project: string) {
  await page.goto(teachSearch(courseTitle(project)));
  await page.getByRole("link", { name: courseTitle(project) }).first().click();
  await expect(page.getByRole("heading", { name: courseTitle(project), level: 1 })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}

async function addLesson(page: Page, title: string, type: string) {
  await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
  await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill(title);
  await page.getByLabel("ชนิดบทเรียน").click();
  await page.getByRole("option", { name: type }).click();
  await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function resume(page: Page, project: string, lesson: string) {
  await page.goto(`/courses/${slug(project)}`);
  await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
  await expect(page.getByRole("heading", { name: lesson, level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.describe("ผู้สอนเตรียมคอร์ส", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("คอร์ส + บทแบบทดสอบ + บทงาน", async ({ page }, info) => {
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
    await addLesson(page, QUIZ_LESSON, "แบบทดสอบ");
    await addLesson(page, WORK_LESSON, "งานที่ต้องส่ง");
  });

  test("แบบทดสอบ + งาน + น้ำหนัก 50/50 + คะแนนขั้นต่ำ 60 + แม่แบบใบประกาศ", async ({ page }, info) => {
    // เปิด 8 หน้าต่อกันในเทสต์เดียว — เกินงบ 30 วินาทีตั้งต้นเมื่อเครื่องพัฒนาหน่วยความจำตึง
    test.slow();
    const p = info.project.name;
    const coursePath = await openCourse(page, p);

    await page.goto(`${coursePath}/questions`);
    await page.getByRole("button", { name: "นำเข้า CSV / Excel" }).click();
    await page.getByLabel("เลือกไฟล์ข้อสอบ").setInputFiles({
      name: "q.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(["ชนิด,โจทย์,ตัวเลือก,คำตอบ,คะแนน", "SINGLE,ข้อเดียว,ถูกต้อง|ผิด,1,1"].join("\n")),
    });
    await page.getByRole("button", { name: "นำเข้า 1 ข้อ" }).click();
    await expect(page.getByText("นำเข้าข้อสอบ 1 ข้อแล้ว")).toBeVisible({ timeout: 30_000 });

    await page.goto(`${coursePath}/quizzes/new`);
    await page.getByLabel("ชื่อแบบทดสอบ", { exact: true }).fill(QUIZ);
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: QUIZ_LESSON }).click();
    await page.getByLabel("แสดงเฉลยให้ผู้เรียน").click();
    await page.getByRole("option", { name: "ทันทีหลังส่ง" }).click();
    await page.getByRole("button", { name: "เพิ่มข้อ: ข้อเดียว" }).click();
    await page.getByRole("button", { name: "สร้างแบบทดสอบ" }).click();
    await expect(page.getByText("สร้างแบบทดสอบแล้ว")).toBeVisible({ timeout: 15_000 });

    await page.goto(`${coursePath}/assignments/new`);
    await page.getByLabel("ชื่องาน", { exact: true }).fill(WORK);
    await page.getByLabel("ผูกกับบทเรียน").click();
    await page.getByRole("option", { name: WORK_LESSON }).click();
    const editor = page.locator('[contenteditable="true"][aria-label="คำสั่งงาน"]');
    await editor.click();
    await editor.pressSequentially("สรุปสิ่งที่ได้เรียน");
    await page.getByLabel("คะแนนเต็ม").fill("10");
    await page.getByRole("button", { name: "สร้างงาน" }).click();
    await expect(page.getByText("สร้างงานแล้ว")).toBeVisible({ timeout: 15_000 });

    await page.goto(`${coursePath}/gradebook/settings`);
    await page.getByLabel(`น้ำหนัก ${QUIZ} (%)`).fill("50");
    await page.getByLabel(`น้ำหนัก ${WORK} (%)`).fill("50");
    await page.getByRole("button", { name: "บันทึกน้ำหนัก" }).click();
    await expect(page.getByText("บันทึกน้ำหนักแล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.goto(coursePath);
    await page.getByLabel("คะแนนรวมขั้นต่ำ (ไม่บังคับ)").fill("60");
    await page.getByRole("button", { name: "บันทึกเงื่อนไข" }).click();
    await expect(page.getByText("บันทึกเงื่อนไขการจบคอร์สแล้ว")).toBeVisible({ timeout: 15_000 });

    // FR-10.2 — แม่แบบ + ตัวอย่าง PDF ก่อนบันทึก
    await page.goto(`${coursePath}/certificate`);
    await expect(page.getByRole("heading", { name: "แม่แบบใบประกาศ", level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("ชื่อผู้ลงนาม").fill(SIGNER);
    await page.getByLabel("ตำแหน่งผู้ลงนาม").fill("คณบดี");
    await expect(page.locator("[data-certificate-preview]")).toContainText(courseTitle(p));
    const previewDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "ดาวน์โหลดตัวอย่าง PDF" }).click();
    const preview = await previewDownload;
    expect(preview.suggestedFilename()).toBe("ตัวอย่างใบประกาศ.pdf");
    const bytes = Buffer.concat(await (await preview.createReadStream()).toArray());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await page.getByRole("button", { name: "บันทึกแม่แบบ" }).click();
    await expect(page.getByText("บันทึกแม่แบบใบประกาศแล้ว — มีผลกับใบที่ออกหลังจากนี้")).toBeVisible({ timeout: 15_000 });

    await page.goto(coursePath);
    await page.getByRole("button", { name: "ส่งให้คณะอนุมัติ" }).click();
    await expect(page.getByText("รอคณะอนุมัติ", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("ผู้ดูแลอนุมัติ", () => {
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

test.describe("เส้นทางปิดเฟส", () => {
  test("ผู้เรียนสอบผ่านและส่งงาน — เรียนครบแต่คะแนนรวมยังไม่ถึง จึงยังไม่ได้ใบประกาศ", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto(`/courses/${slug(p)}`);
    await page.getByRole("button", { name: "ลงทะเบียนเรียน" }).click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({ timeout: 30_000 });

    await resume(page, p, QUIZ_LESSON);
    await page.getByRole("button", { name: "เริ่มทำแบบทดสอบ" }).click();
    await expect(page).toHaveURL(/\/quiz\/[a-z0-9]+$/, { timeout: 30_000 });
    const q = page.locator("[data-quiz-question]").filter({ hasText: "ข้อเดียว" });
    await q.getByRole("radio", { name: "ถูกต้อง" }).check();
    await expect(q.getByText("บันทึกแล้ว")).toBeVisible();
    await page.getByRole("button", { name: "ส่งคำตอบ" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยันส่งคำตอบ" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "ผ่านแบบทดสอบ" })).toBeVisible({ timeout: 30_000 });

    // "เรียนต่อ" พากลับบทล่าสุด (บทแบบทดสอบ) — ไปบทงานด้วยปุ่มบทถัดไป
    await resume(page, p, QUIZ_LESSON);
    await page.getByRole("link", { name: "บทถัดไป" }).click();
    await expect(page.getByRole("heading", { name: WORK_LESSON, level: 1 })).toBeVisible({ timeout: 30_000 });
    const form = page.getByRole("form", { name: "ส่งงาน" });
    await form.getByLabel("คำตอบ / ข้อความถึงผู้สอน").fill("สรุปของฉัน");
    await form.getByRole("button", { name: "ส่งงาน" }).click();
    await expect(page.getByText("ส่งงานแล้ว", { exact: true })).toBeVisible({ timeout: 30_000 });

    // เรียนครบ 100% แต่คะแนนรวม = 100×50% + 0 = 50 < 60
    await page.goto("/certificates");
    await expect(page.locator("[data-certificate]").filter({ hasText: courseTitle(p) })).toHaveCount(0);
  });

  test("ผู้สอนให้คะแนนงาน → คะแนนรวม 90 → จบคอร์ส (Q4)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: STATE_FILE.instructor });
    const page = await context.newPage();
    const coursePath = await openCourse(page, p);
    await page.goto(`${coursePath}/assignments/review`);
    await page.locator("[data-queue-item]").getByRole("link", { name: "ตรวจ" }).click();
    await page.getByLabel("คะแนน (เต็ม 10)").fill("8");
    await page.getByLabel("คะแนน (เต็ม 10)").press("Enter");
    await expect(page.getByText("บันทึกคะแนนและแจ้งผู้เรียนแล้ว")).toBeVisible({ timeout: 15_000 });

    await page.goto(`${coursePath}/gradebook`);
    await expect(page.locator("[data-total]").filter({ visible: true }).first()).toHaveText(/^90\s*A$/, {
      timeout: 30_000,
    });
    await context.close();
  });

  test("ผู้เรียนได้ใบประกาศ + แจ้งเตือน · ดาวน์โหลด PDF ได้ (FR-10.1 · FR-10.4)", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/notifications");
    await expect(
      page.locator("[data-notification]").filter({ hasText: `ได้รับใบประกาศ “${courseTitle(p)}”` }),
    ).toHaveCount(1, { timeout: 30_000 });
    // แจ้งเตือนเรียนจบต้องระบุชื่อคอร์ส (งานค้างจาก Phase 2 · phase-3-plan ขั้น 0)
    await expect(
      page.locator("[data-notification]").filter({ hasText: `ยินดีด้วย คุณเรียนจบคอร์ส “${courseTitle(p)}” แล้ว` }),
    ).toHaveCount(1);

    await page.goto("/certificates");
    const card = page.locator("[data-certificate]").filter({ hasText: courseTitle(p) });
    await expect(card).toHaveCount(1);
    const code = (await card.locator("[data-certificate-code]").textContent())!.trim();
    expect(code).toMatch(/^LMS-\d{4}-[23456789A-HJKMNP-Z]{6}$/);
    codes.set(p, code);

    const response = await page.request.get(`/api/certificate/${code}`);
    expect(response.status()).toBe(200);
    const pdf = await response.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("หน้า /verify/[code] เปิดได้โดยไม่ล็อกอิน (FR-10.3)", async ({ browser }, info) => {
    const p = info.project.name;
    const context = await browser.newContext({ storageState: ANONYMOUS });
    const page = await context.newPage();
    await page.goto(`/verify/${codes.get(p)!.toLowerCase()}`);
    await expect(page.locator("[data-verify-state]")).toHaveAttribute("data-verify-state", "valid", { timeout: 30_000 });
    await expect(page.getByText("ใบประกาศนี้ถูกต้อง")).toBeVisible();
    await expect(page.getByText(courseTitle(p))).toBeVisible();

    await page.goto("/verify/LMS-2026-222222");
    await expect(page.getByText("ไม่พบใบประกาศรหัสนี้")).toBeVisible();
    await context.close();
  });

  test("ผู้ดูแลเพิกถอน → หน้า verify ขึ้นถูกเพิกถอน · ผู้เรียนดาวน์โหลดไม่ได้ (FR-10.5)", async ({ browser, page }, info) => {
    const p = info.project.name;
    const code = codes.get(p)!;
    const context = await browser.newContext({ storageState: STATE_FILE.admin });
    const admin = await context.newPage();
    await admin.goto(`/admin/certificates?q=${code}`);
    const row = admin.locator("[data-admin-certificate]").filter({ hasText: code });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.getByRole("button", { name: "เพิกถอน" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel(/^เหตุผล/).fill("ทดสอบการเพิกถอนใบประกาศ");
    await dialog.getByRole("button", { name: "ยืนยันเพิกถอน" }).focus();
    await admin.keyboard.press("Enter");
    await expect(admin.getByText(`เพิกถอนใบประกาศ ${code} แล้ว`)).toBeVisible({ timeout: 15_000 });
    await context.close();

    const anonymous = await browser.newContext({ storageState: ANONYMOUS });
    const verify = await anonymous.newPage();
    await verify.goto(`/verify/${code}`);
    await expect(verify.getByText("ใบประกาศนี้ถูกเพิกถอนแล้ว")).toBeVisible({ timeout: 30_000 });
    await expect(verify.getByText("ทดสอบการเพิกถอนใบประกาศ")).toHaveCount(0);
    await anonymous.close();

    const response = await page.request.get(`/api/certificate/${code}`, { maxRedirects: 0 });
    expect(response.status()).toBe(403);
  });
});
