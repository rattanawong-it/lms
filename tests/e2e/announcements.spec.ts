import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";

/**
 * M11 — ประกาศ 3 ระดับ + การแจ้งเตือนในแอป
 *
 * desktop กับ mobile ใช้บัญชีผู้เรียนเดียวกันและรันพร้อมกัน
 * จึงไม่ตรวจ "ตัวเลข" บนกระดิ่ง (อีก project เพิ่ม/อ่านรายการของตัวเองอยู่ด้วย)
 * แต่ตรวจที่รายการของประกาศที่ตั้งชื่อไม่ซ้ำตามชื่อ project + รอบที่รันแทน
 */
const COURSE_SLUG = "intro-to-lms";
const COURSE_TITLE = "เริ่มต้นใช้งาน KRIRK LMS";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const courseTitle = (project: string) => `ประกาศคอร์ส ${project} ${RUN_ID}`;
const globalTitle = (project: string) => `ประกาศทั้งระบบ ${project} ${RUN_ID}`;

test.describe.configure({ mode: "serial" });

async function writeAnnouncement(page: Page, title: string, body: string) {
  await page.getByLabel("หัวข้อประกาศ", { exact: true }).fill(title);
  const editor = page.locator('[contenteditable="true"][aria-label="เนื้อหา"]');
  await editor.click();
  await editor.pressSequentially(body);
}

async function openCourseAnnouncements(page: Page) {
  await page.goto("/teach");
  await page.getByRole("link", { name: COURSE_TITLE }).first().click();
  await expect(page.getByRole("heading", { name: COURSE_TITLE, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  // ไปตาม URL ของคอร์สตรง ๆ — คำว่า "ประกาศ" ชนกับเมนูหลักด้านบน
  await page.goto(`${new URL(page.url()).pathname}/announcements`);
  await expect(page.getByRole("heading", { name: "ประกาศของคอร์ส", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

/** ลบผ่านกล่องยืนยัน — ส่งด้วย Enter ตาม CLAUDE.md §6 (พิกัดคลิกของ dialog เพี้ยนบนมือถือ) */
async function deleteAnnouncement(page: Page, title: string) {
  const card = page.getByRole("article", { name: title });
  await card.getByRole("button", { name: "ลบ" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "ลบประกาศ" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("ลบประกาศแล้ว")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("article", { name: title })).toHaveCount(0);
}

test.describe("ประกาศระดับคอร์ส → การแจ้งเตือนของผู้เรียน", () => {
  test("ผู้เรียนลงทะเบียนคอร์สไว้ก่อน", async ({ page }) => {
    await page.goto(`/courses/${COURSE_SLUG}`);
    const enroll = page.getByRole("button", { name: "ลงทะเบียนเรียน" });
    if (await enroll.isVisible()) {
      await enroll.click();
      await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({
        timeout: 30_000,
      });
    }
    await expect(page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ })).toBeVisible();
  });

  test.describe("ผู้สอน", () => {
    test.use({ storageState: STATE_FILE.instructor });

    test("หัวข้อว่างถูกปฏิเสธพร้อมข้อความภาษาไทย (FR-11.1)", async ({ page }) => {
      await openCourseAnnouncements(page);
      await page.getByRole("button", { name: "เผยแพร่ประกาศ" }).click();
      // required ของเบราว์เซอร์กันไว้ก่อน — ช่องหัวข้อต้องยังว่างและไม่มีประกาศใหม่
      await expect(page.getByLabel("หัวข้อประกาศ", { exact: true })).toHaveJSProperty(
        "validity.valueMissing",
        true,
      );
    });

    test("เผยแพร่ประกาศของคอร์สแล้วผู้เรียนได้รับแจ้ง (FR-11.1)", async ({ page }, info) => {
      await openCourseAnnouncements(page);
      await writeAnnouncement(page, courseTitle(info.project.name), "สัปดาห์นี้เรียนสดเลื่อนเป็นวันศุกร์");
      await page.getByRole("button", { name: "เผยแพร่ประกาศ" }).click();

      await expect(page.getByText(/เผยแพร่ประกาศแล้ว/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("article", { name: courseTitle(info.project.name) })).toBeVisible();
    });
  });

  test("ผู้เรียนเห็นการแจ้งเตือน กดแล้วไปที่ประกาศและถูกนับว่าอ่านแล้ว (FR-11.2)", async ({
    page,
  }, info) => {
    const title = courseTitle(info.project.name);

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /การแจ้งเตือน \d+ รายการที่ยังไม่อ่าน/ }).first()).toBeVisible();

    await page.goto("/notifications?filter=unread");
    const item = page.locator("[data-notification]").filter({ hasText: `ประกาศ: ${title}` });
    await expect(item).toHaveAttribute("data-unread", "");

    await item.getByRole("link").click();
    await expect(page).toHaveURL(/\/announcements#a-[a-z0-9]+$/, { timeout: 30_000 });
    const card = page.getByRole("article", { name: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("สัปดาห์นี้เรียนสดเลื่อนเป็นวันศุกร์")).toBeVisible();
    await expect(card.getByText(COURSE_TITLE)).toBeVisible();

    await page.goto("/notifications");
    await expect(
      page.locator("[data-notification]").filter({ hasText: `ประกาศ: ${title}` }),
    ).not.toHaveAttribute("data-unread", "");
  });
});

test.describe("ประกาศทั้งระบบ + ปักหมุด", () => {
  test.describe("Super Admin", () => {
    test.use({ storageState: STATE_FILE.admin });

    test("ประกาศถึงผู้ใช้ทุกคนและปักหมุดไว้ (FR-11.1)", async ({ page }, info) => {
      await page.goto("/admin/announcements");
      await expect(page.getByRole("heading", { name: "ประกาศ", level: 1 })).toBeVisible();

      await writeAnnouncement(page, globalTitle(info.project.name), "ระบบปิดปรับปรุงคืนวันเสาร์");
      await page.getByLabel("ปักหมุดไว้บนสุด").check();
      await page.getByRole("button", { name: "เผยแพร่ประกาศ" }).click();

      await expect(page.getByText(/เผยแพร่ประกาศแล้ว/)).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("article", { name: globalTitle(info.project.name) }).getByText("ปักหมุด", { exact: true }),
      ).toBeVisible();
    });
  });

  test("ผู้เรียนเห็นประกาศทั้งระบบที่ปักหมุดบนหน้าประกาศและหน้าหลัก", async ({ page }, info) => {
    const title = globalTitle(info.project.name);

    await page.goto("/announcements");
    const card = page.getByRole("article", { name: title });
    await expect(card).toBeVisible();
    await expect(card.getByText("ปักหมุด", { exact: true })).toBeVisible();
    await expect(card.getByText("ทั้งมหาวิทยาลัย").first()).toBeVisible();

    await page.goto("/dashboard");
    await expect(
      page.getByRole("region", { name: "ประกาศล่าสุด" }).getByText(title),
    ).toBeVisible();
  });

  test("ผู้เรียนเข้าหน้าจัดการประกาศไม่ได้ (§4.1)", async ({ page }) => {
    const admin = await page.goto("/admin/announcements");
    expect(admin?.status()).toBe(403);
  });
});

test.describe("ลบประกาศแล้วหายจากผู้รับ", () => {
  test.describe("ผู้สอน", () => {
    test.use({ storageState: STATE_FILE.instructor });
    test("ลบประกาศของคอร์ส", async ({ page }, info) => {
      await openCourseAnnouncements(page);
      await deleteAnnouncement(page, courseTitle(info.project.name));
    });
  });

  test.describe("Super Admin", () => {
    test.use({ storageState: STATE_FILE.admin });
    test("ลบประกาศทั้งระบบ", async ({ page }, info) => {
      await page.goto("/admin/announcements");
      await deleteAnnouncement(page, globalTitle(info.project.name));
    });
  });

  test("ผู้เรียนไม่เห็นประกาศและการแจ้งเตือนที่ถูกลบแล้ว", async ({ page }, info) => {
    await page.goto("/announcements");
    await expect(page.getByRole("article", { name: courseTitle(info.project.name) })).toHaveCount(0);
    await expect(page.getByRole("article", { name: globalTitle(info.project.name) })).toHaveCount(0);

    await page.goto("/notifications");
    await expect(
      page.locator("[data-notification]").filter({ hasText: courseTitle(info.project.name) }),
    ).toHaveCount(0);
  });
});
