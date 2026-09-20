import { expect, test as setup } from "@playwright/test";
import { STUDENT, STUDENT_STATE } from "./constants";

/**
 * ล็อกอินครั้งเดียวแล้วเก็บ session ไว้ให้ทุกเทสต์ใช้ร่วมกัน
 *
 * จำเป็นเพราะ FR-01.7 จำกัดการเข้าสู่ระบบไว้ที่ 5 ครั้งต่อ 15 นาทีต่อ IP
 * ถ้าแต่ละเทสต์ล็อกอินเอง ชุดเทสต์จะชนลิมิตของตัวเองแล้วล้มแบบสุ่ม
 */
setup("ล็อกอินผู้เรียนแล้วเก็บ session ไว้ใช้ร่วมกัน", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("อีเมล", { exact: true }).fill(STUDENT.email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(STUDENT.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.context().storageState({ path: STUDENT_STATE });
});
