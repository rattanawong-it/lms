import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ไฟล์ต้นฉบับจาก design tool (ใช้อ้างอิง UI เท่านั้น ไม่ได้ build เข้าแอป)
    "project-ui/**",
    // Prisma client ที่ generate อัตโนมัติ
    "src/generated/**",
  ]),
]);

export default eslintConfig;
