import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M05 · FR-05.10 — เครื่องมือ editor ขั้นสูง (system-design §8.4)
 * เขียนด้วยปุ่มจริง + โหมดแก้โค้ด HTML ในคำอธิบายคอร์ส แล้วตรวจผลที่หน้าคอร์สสาธารณะ
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `e2e-editor-${RUN_ID}`;
const TITLE = `คอร์สทดสอบ editor ${RUN_ID}`;

test.describe.configure({ mode: "serial" });
test.use({ storageState: STATE_FILE.instructor });
test.slow();

/** HTML ที่ผู้สอนวาง — มีทั้งของที่รองรับและของอันตรายที่ต้องหายไป */
const PASTED_HTML = [
  '<p style="text-align: center">ย่อหน้ากึ่งกลางจาก HTML</p>',
  '<div data-callout="warning"><p>กล่องคำเตือนจาก HTML</p></div>',
  '<p><span style="color:#ff0000">สีอิสระจาก Word</span> และ H<sub>2</sub>O</p>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>อ่านบทที่ 1</p></li></ul>',
  "<script>window.__pwned = 1</script>",
  '<img src="https://evil.example/x.png" onerror="window.__pwned = 2">',
  '<p onclick="window.__pwned = 3">ข้อความธรรมดา</p>',
].join("");

async function openSettings(page: Page) {
  await page.goto(teachSearch(TITLE));
  await page.getByRole("link", { name: TITLE }).click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
}

test("สร้างคอร์สสำหรับทดสอบ editor", async ({ page }) => {
  await page.goto("/teach/courses/new");
  await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(TITLE);
  await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(SLUG);
  await page.getByRole("button", { name: "สร้างคอร์ส" }).click();
  await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/, { timeout: 30_000 });
});

test("จัดกึ่งกลาง · สีตัวอักษร · จัดการตาราง · แก้โค้ด HTML แล้วแสดงผลถูกต้อง (FR-05.10)", async ({ page }) => {
  await openSettings(page);
  const editor = page.getByLabel("คำอธิบายคอร์ส (ไม่บังคับ)", { exact: true });

  // โหมด HTML ก่อน — แทนเนื้อหาทั้งหมด แท็กอันตรายต้องหายตอน parse
  await page.getByRole("button", { name: "แก้โค้ด HTML" }).click();
  await page.getByRole("textbox", { name: "โค้ด HTML" }).fill(PASTED_HTML);
  await page.getByRole("button", { name: "ใช้โค้ดนี้" }).click();
  await expect(editor.getByText("ย่อหน้ากึ่งกลางจาก HTML")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(editor.locator("img")).toHaveCount(0);

  // พิมพ์ต่อท้าย → จัดกึ่งกลาง → ใส่สีแดง ด้วยปุ่มจริง
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await editor.pressSequentially("หัวข้อสีแดง");
  await page.getByRole("button", { name: /^จัดตำแหน่ง/ }).click();
  await page.getByRole("menuitem", { name: "กึ่งกลาง" }).click();
  await editor.press("Shift+Home");
  await page.getByRole("button", { name: "สีตัวอักษร" }).click();
  await page.getByRole("menuitem", { name: "แดง" }).click();

  // ตาราง 3×3 → เพิ่มแถวล่าง = 4 แถว (แถบเครื่องมือตารางโผล่เมื่อเคอร์เซอร์อยู่ในตาราง)
  await editor.press("ControlOrMeta+End");
  await page.getByRole("button", { name: "แทรกตาราง 3×3" }).click();
  await page.getByRole("button", { name: "แทรกแถวด้านล่าง" }).click();
  await expect(editor.locator("table tr")).toHaveCount(4);

  await expect(page.getByText(/\d+ คำ · \d+ ตัวอักษร/)).toBeVisible();

  await page.getByRole("button", { name: "บันทึกข้อมูลคอร์ส" }).click();
  await expect(page.getByText("บันทึกข้อมูลคอร์สแล้ว")).toBeVisible({ timeout: 30_000 });

  // หน้าคอร์สสาธารณะ — render จาก JSON ที่ server กรองแล้ว
  await page.goto(`/courses/${SLUG}`);
  await expect(page.getByText("ย่อหน้ากึ่งกลางจาก HTML")).toHaveClass(/text-center/);
  await expect(page.getByRole("note", { name: "คำเตือน" })).toContainText("กล่องคำเตือนจาก HTML");
  await expect(page.getByText("2", { exact: true }).locator("xpath=self::sub")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "ทำแล้ว" })).toBeChecked();
  await expect(page.getByText("หัวข้อสีแดง")).toHaveClass(/text-red-700/);
  await expect(page.getByText("หัวข้อสีแดง").locator("xpath=ancestor::p[1]")).toHaveClass(/text-center/);

  // สีอิสระจาก Word ไม่กลายเป็น style · ไม่มีรูปจากโดเมนนอก · ไม่มี on* ใด ๆ
  const freeColor = page.getByText("สีอิสระจาก Word");
  expect(await freeColor.evaluate((el) => el.closest("p")?.outerHTML ?? "")).not.toMatch(/style=|#ff0000/i);
  await expect(page.locator('img[src*="evil.example"]')).toHaveCount(0);
  await expect(page.locator("[onclick], [onerror]")).toHaveCount(0);
  await expect(page.locator("table tr")).toHaveCount(4);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});
