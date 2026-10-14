import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // CLI (migrate/studio) ต้องต่อตรง ไม่ผ่าน pooler — Neon ให้ค่านี้มาเป็น DATABASE_URL_UNPOOLED
  // เครื่องพัฒนาไม่ต้องตั้ง ใช้ DATABASE_URL ตัวเดียว · ตัวแอปใช้ DATABASE_URL (pooled) เสมอ (src/lib/db.ts)
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL"),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
