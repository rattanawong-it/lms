import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M06 — ลงทะเบียน → คอร์สของฉัน → เรียน → บันทึกความคืบหน้า
 *
 * ใช้คอร์สจาก seed (นโยบาย OPEN) แทนการสร้างคอร์สใหม่ และ **แยกคอร์สตาม project**
 * เพราะ desktop กับ mobile ใช้บัญชีผู้เรียนคนเดียวกันและรันพร้อมกัน —
 * ถ้าใช้คอร์สเดียวกัน ทั้งสองจะแย่งกันลงทะเบียนและทำเครื่องหมายบทเรียนของกันและกัน
 *
 * เทสต์ชุดนี้รันซ้ำบนฐานข้อมูลเดิมได้ จึงรับได้ทั้งกรณีที่ยังไม่ลงทะเบียน
 * และกรณีที่ลงทะเบียนค้างอยู่จากรอบก่อน
 */
const COURSES = {
  desktop: { slug: "intro-to-lms", title: "เริ่มต้นใช้งาน KRIRK LMS" },
  mobile: { slug: "academic-writing", title: "การเขียนเชิงวิชาการและการอ้างอิง" },
} as const;

function courseFor(info: TestInfo) {
  return COURSES[info.project.name as keyof typeof COURSES] ?? COURSES.desktop;
}

test.describe.configure({ mode: "serial" });

/** พาไปหน้าเรียนของคอร์สที่ใช้ทดสอบ ไม่ว่าจะเพิ่งลงทะเบียนหรือลงไว้แล้ว */
async function openLearnPage(page: Page, title: string) {
  await page.goto("/my-courses");
  const card = page.getByRole("listitem").filter({ hasText: title }).first();
  await card.getByRole("link", { name: /เริ่มเรียน|เรียนต่อ|ทบทวน/ }).click();
  await expect(page).toHaveURL(/\/learn\/[a-z0-9]+\/[a-z0-9]+/, { timeout: 30_000 });
}

/**
 * ส่งฟอร์มในกล่องโต้ตอบด้วยปุ่ม Enter แทนการคลิก
 *
 * บนหน้าที่มีตารางกว้าง (`min-w-[760px]` ใน `overflow-x-auto`) Chrome โหมดจำลองมือถือ
 * จะย่อทั้งหน้าลง (layout viewport กลายเป็น ~688px ทั้งที่ตั้งไว้ 375px) แล้วพิกัดคลิก
 * ของ Playwright กับ element ที่ `position: fixed` อย่างกล่องโต้ตอบจะเลื่อนไม่ตรงกัน
 * จนคลิกไปโดน overlay แทน — การกด Enter เป็นพฤติกรรมจริงของผู้ใช้และไม่พึ่งพิกัด
 */
async function submitDialog(dialog: Locator) {
  await dialog.getByLabel(/วันหมดสิทธิ์เรียน/).press("Enter");
}

/** เปิดหน้าจัดการผู้เรียนของคอร์สจากฝั่งผู้สอน */
async function openRoster(page: Page, title: string) {
  await page.goto(teachSearch(title));
  await page.getByRole("link", { name: title }).first().click();
  await page.getByRole("link", { name: "ผู้เรียน" }).click();
  await expect(page.getByRole("heading", { name: "ผู้เรียนในคอร์ส", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("ผู้เรียนลงทะเบียนและบันทึกความคืบหน้า", () => {
  test("ลงทะเบียนคอร์สนโยบาย OPEN แล้วเข้าเรียนได้ทันที (FR-06.1)", async ({ page }, info) => {
    const course = courseFor(info);
    await page.goto(`/courses/${course.slug}`);

    const enrollButton = page.getByRole("button", { name: /^(ลงทะเบียนเรียน)$/ });
    if (await enrollButton.isVisible()) {
      await enrollButton.click();
      await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({
        timeout: 30_000,
      });
    }

    // ลงทะเบียนแล้วแผงข้างต้องเปลี่ยนเป็นความคืบหน้า + ปุ่มเข้าเรียน
    await expect(page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("คอร์สของฉันแยกตามสถานะและมีแถบความคืบหน้า (FR-06.6)", async ({ page }, info) => {
    const course = courseFor(info);
    await page.goto("/my-courses");

    await expect(page.getByRole("heading", { name: "คอร์สของฉัน", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /กำลังเรียน/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: /เรียนจบ/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /หมดอายุ/ })).toBeVisible();

    const card = page.getByRole("listitem").filter({ hasText: course.title }).first();
    await expect(card).toBeVisible();
    await expect(card.getByRole("progressbar")).toBeVisible();
  });

  test("กดเรียนจบบทเรียนแล้วความคืบหน้าเปลี่ยน (FR-06.3)", async ({ page }, info) => {
    await openLearnPage(page, courseFor(info).title);

    // เริ่มจากสถานะ "ยังไม่จบ" เสมอ เพื่อให้รันซ้ำได้ผลเหมือนกันทุกรอบ
    const undo = page.getByRole("button", { name: "ยกเลิกการทำเครื่องหมาย" });
    if (await undo.isVisible()) {
      await undo.click();
      await expect(page.getByText("ยกเลิกการทำเครื่องหมายแล้ว")).toBeVisible({ timeout: 30_000 });
    }

    await page.getByRole("button", { name: "เรียนจบบทนี้" }).click();
    await expect(page.getByText(/ความคืบหน้า \d+%|เรียนจบคอร์สนี้แล้ว/)).toBeVisible({
      timeout: 30_000,
    });

    // ยืนยันจากข้อมูลที่บันทึกจริง ไม่ใช่แค่หน้าที่ refresh เอง —
    // ภายใต้โหลดของชุดเทสต์เต็ม การ refresh ฝั่ง client ช้าจนเทสต์หมดเวลาได้
    await page.reload();
    await expect(page.getByRole("button", { name: "ยกเลิกการทำเครื่องหมาย" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("เรียนจบแล้ว").first()).toBeVisible();

    // จำนวนบทที่เรียนจบอยู่คนละที่กันตามขนาดจอ — จอ lg อยู่ในสารบัญข้างเนื้อหา
    // ส่วนจอเล็กอยู่บนปุ่มเปิด drawer (FR-05.6) จึงรับได้ทั้งสองแบบ
    const inSidebar = page.getByText(/เรียนแล้ว [1-9]\d*\/\d+ บทเรียน/);
    const onDrawerButton = page.getByRole("button", {
      name: /สารบัญบทเรียน \([1-9]\d*\/\d+\)/,
    });
    await expect(inSidebar.or(onDrawerButton).first()).toBeVisible();
  });

  test('ปุ่ม "เรียนต่อ" พากลับมาที่บทเรียนล่าสุด (FR-06.4)', async ({ page }, info) => {
    const course = courseFor(info);
    await openLearnPage(page, course.title);
    const learnUrl = page.url();

    await page.goto(`/courses/${course.slug}`);
    await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();

    await expect(page).toHaveURL(learnUrl, { timeout: 30_000 });
  });
});

test.describe("ผู้สอนจัดการผู้เรียนของคอร์ส", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("เห็นรายชื่อผู้เรียนและเพิ่มเป็นกลุ่มได้ (FR-06.2)", async ({ page }, info) => {
    await openRoster(page, courseFor(info).title);

    await page.getByRole("button", { name: "เพิ่มผู้เรียน" }).first().click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByLabel(/อีเมลผู้เรียน/).fill("student@krirk.ac.th");
    await submitDialog(addDialog);

    // ผู้เรียนคนนี้ลงทะเบียนไว้แล้วจากชุดเทสต์ด้านบน ระบบต้องบอกว่าซ้ำ ไม่ใช่สร้างซ้อน
    await expect(page.getByText(/เพิ่มผู้เรียน \d+ คน/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("cell", { name: /student@krirk\.ac\.th/ })).toBeVisible();
  });

  test("อีเมลที่ไม่มีบัญชีในระบบถูกรายงานกลับ ไม่สร้างบัญชีให้เอง", async ({ page }, info) => {
    await openRoster(page, courseFor(info).title);

    await page.getByRole("button", { name: "เพิ่มผู้เรียน" }).first().click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByLabel(/อีเมลผู้เรียน/).fill("no-such-account@krirk.ac.th");
    await submitDialog(addDialog);

    await expect(page.getByText(/ไม่พบผู้ใช้ตามอีเมลที่กรอก/)).toBeVisible({ timeout: 30_000 });
  });
});
