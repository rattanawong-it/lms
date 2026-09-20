import { expect, test as setup } from "@playwright/test";
import { ACCOUNTS, STATE_FILE, type AccountName } from "./constants";

/**
 * ล็อกอินแต่ละบทบาทครั้งเดียวแล้วเก็บ session ไว้ให้ทุกเทสต์ใช้ร่วมกัน
 *
 * จำเป็นเพราะ FR-01.7 จำกัดการเข้าสู่ระบบไว้ที่ 5 ครั้งต่อ 15 นาทีต่อ IP
 * ถ้าแต่ละเทสต์ล็อกอินเอง ชุดเทสต์จะชนลิมิตของตัวเองแล้วล้มแบบสุ่ม
 * จำนวนครั้งต่อรอบตอนนี้: setup 3 ครั้ง + เทสต์ล็อกอินจริงอีก 1 ครั้ง (เฉพาะ desktop)
 */
for (const name of Object.keys(ACCOUNTS) as AccountName[]) {
  setup(`ล็อกอิน ${name} แล้วเก็บ session`, async ({ page }) => {
    const account = ACCOUNTS[name];

    await page.goto("/login");
    await page.getByLabel("อีเมล", { exact: true }).fill(account.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();

    await expect(page).toHaveURL(account.home, { timeout: 30_000 });
    await page.context().storageState({ path: STATE_FILE[name] });
  });
}
