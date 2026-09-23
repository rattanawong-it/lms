import { expect, test } from "@playwright/test";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * คอร์สตัวอย่างการประเมินผลจาก seed (`assessment-demo` · phase-2-plan §3)
 * ตรวจแบบอ่านอย่างเดียว — ไม่ลงทะเบียน/ไม่ทำข้อสอบ เพื่อให้คอร์สตัวอย่างคงสภาพไว้สาธิต
 */
const TITLE = "ตัวอย่างการสอบ ส่งงาน และใบประกาศ";

test.use({ storageState: STATE_FILE.instructor });

test("มีแบบทดสอบ 6 ข้อ งาน 1 ชิ้น น้ำหนักครบ 100% และแม่แบบใบประกาศพร้อมใช้", async ({ page }) => {
  await page.goto(teachSearch(TITLE));
  await page.getByRole("link", { name: TITLE }).first().click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
  const coursePath = new URL(page.url()).pathname;

  await page.goto(`${coursePath}/quizzes`);
  await expect(page.locator("[data-quiz]").filter({ hasText: "แบบทดสอบ 6 ชนิด" })).toContainText("ข้อตายตัว 6 ข้อ");

  await page.goto(`${coursePath}/assignments`);
  await expect(page.locator("[data-assignment]").filter({ hasText: "รายงานสั้น 1 หน้า" })).toContainText(
    "บทเรียน: ส่งรายงานสั้น",
  );

  await page.goto(`${coursePath}/gradebook/settings`);
  await expect(page.locator("[data-weight-total]")).toHaveText("รวม 100%", { timeout: 30_000 });

  await page.goto(`${coursePath}/certificate`);
  await expect(page.getByLabel("ชื่อผู้ลงนาม")).toHaveValue("ผู้สอนตัวอย่าง");
});
