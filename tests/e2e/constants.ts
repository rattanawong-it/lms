/**
 * ค่าคงที่ของชุดทดสอบ e2e — ไฟล์นี้ต้องไม่ประกาศ test ใด ๆ
 * เพราะ playwright.config.ts import เข้าไปด้วย (config โหลดไฟล์ที่มี test ไม่ได้)
 */
export const STUDENT_STATE = "tests/e2e/.auth/student.json";

export const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? "student@krirk.ac.th",
  password: process.env.E2E_STUDENT_PASSWORD ?? "ChangeMe!2026",
};

/** ไม่เก็บ session — ใช้กับเทสต์ที่ต้องเป็นผู้เยี่ยมชมที่ยังไม่ล็อกอิน */
export const ANONYMOUS = { cookies: [], origins: [] };
