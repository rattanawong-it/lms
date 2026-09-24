import { defineConfig, devices } from "@playwright/test";
import { STUDENT_STATE } from "./tests/e2e/constants";

// ใช้ค่าเดียวกับ dev server (เช่น LINE_CHANNEL_SECRET สำหรับเซ็น webhook ใน line.spec) · ไม่มีไฟล์ (CI) ก็ข้าม
try {
  process.loadEnvFile(".env");
} catch {}

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * E2E ตาม system-design §9 (Testing) — ทดสอบบน viewport 375 และ 1280
 * ต้องมีฐานข้อมูลที่ seed แล้ว (`pnpm db:up && pnpm db:migrate && pnpm db:seed`)
 * และติดตั้ง browser ครั้งแรกด้วย `pnpm exec playwright install --with-deps chromium`
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // ล็อกอินครั้งเดียวแล้วส่ง session ต่อให้ทุก project (ดูเหตุผลใน tests/e2e/auth.setup.ts)
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: STUDENT_STATE,
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
        storageState: STUDENT_STATE,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
