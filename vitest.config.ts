import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Unit test ตาม system-design §9 (Testing) — rbac, grading, progress calc */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    // เทสต์แรกของไฟล์ที่ render + getByRole จ่ายค่าเริ่ม jsdom/accessibility tree
    // เมื่อ pre-commit รันทุกไฟล์พร้อมกันบนเครื่องที่หน่วยความจำตึงใช้ได้ถึง ~6 วิ (เกินค่าเริ่มต้น 5 วิ)
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // ดูเหตุผลใน tests/unit/stubs/server-only.ts
      "server-only": path.resolve(__dirname, "tests/unit/stubs/server-only.ts"),
    },
  },
});
