import { expect, test } from "@playwright/test";

/**
 * M11 · FR-11.4 — หน้าตั้งค่าช่องทางแจ้งเตือน (ผู้เรียน)
 * การส่งอีเมลจริงตรวจที่ phase-2.spec (ได้ใบประกาศ → อีเมลเข้า Mailpit)
 */
test.describe("ตั้งค่าการแจ้งเตือน", () => {
  test("ค่าเริ่มต้นตาม FR-11.3 · LINE ใช้ไม่ได้จนกว่าจะเปิดใช้/ผูกบัญชี", async ({ page }) => {
    await page.goto("/settings/notifications");
    await expect(page.getByRole("link", { name: "การแจ้งเตือน", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-notify-type]")).toHaveCount(8);

    await expect(page.getByLabel("ใบประกาศ ทางอีเมล", { exact: true })).toBeChecked();
    await expect(page.getByLabel("ได้รับคะแนน ทางอีเมล", { exact: true })).toBeChecked();
    await expect(page.getByLabel("ประกาศ ทางอีเมล", { exact: true })).not.toBeChecked();
    await expect(page.getByLabel("ใบประกาศ ทางLINE", { exact: true })).toBeDisabled();
    await expect(page.getByText(/ระบบยังไม่เปิดใช้การแจ้งเตือนทาง LINE|เชื่อมต่อบัญชี LINE ก่อน/)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("เปิด/ปิดแล้วบันทึก ค่าคงอยู่หลังโหลดใหม่", async ({ page }, testInfo) => {
    // เขียนการตั้งค่าของบัญชีผู้เรียนที่ทุก project ใช้ร่วมกัน — รันครั้งเดียว
    // ใช้ชนิด "คาบเรียนสดใกล้เริ่ม" ที่ไม่มีเทสต์อื่นพึ่งอีเมลของมัน
    test.skip(testInfo.project.name !== "desktop", "เขียนข้อมูลร่วม รันครั้งเดียวพอ");

    await page.goto("/settings/notifications");
    const liveEmail = page.getByLabel("คาบเรียนสดใกล้เริ่ม ทางอีเมล", { exact: true });
    await expect(liveEmail).not.toBeChecked();

    await liveEmail.click();
    await page.getByRole("button", { name: "บันทึกการตั้งค่า" }).click();
    await expect(page.getByText("บันทึกการตั้งค่าการแจ้งเตือนแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(liveEmail).toBeChecked();
    await expect(page.getByLabel("ใบประกาศ ทางอีเมล", { exact: true })).toBeChecked();

    await liveEmail.click();
    await page.getByRole("button", { name: "บันทึกการตั้งค่า" }).click();
    await expect(page.getByText("บันทึกการตั้งค่าการแจ้งเตือนแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(liveEmail).not.toBeChecked();
  });

  test("ไปหน้าตั้งค่าจากหน้ารวมการแจ้งเตือนได้", async ({ page }) => {
    await page.goto("/notifications");
    await page.getByRole("link", { name: "ตั้งค่าช่องทาง" }).click();
    await expect(page).toHaveURL(/\/settings\/notifications$/);
  });
});
