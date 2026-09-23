/**
 * ชี้ git ไปใช้ hook ใน `.githooks/` ของ repo (เรียกจาก `prepare` ตอน `pnpm install`)
 * ไม่ต้องพึ่ง husky · นอก git repo (เช่น build ใน container) ข้ามไปเงียบ ๆ
 */
import { execSync } from "node:child_process";

try {
  execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  // ไม่ใช่ git repo หรือไม่มี git — ไม่ต้องติดตั้ง hook
}
