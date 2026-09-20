/**
 * ค่าคงที่ของชุดทดสอบ e2e — ไฟล์นี้ต้องไม่ประกาศ test ใด ๆ
 * เพราะ playwright.config.ts import เข้าไปด้วย (config โหลดไฟล์ที่มี test ไม่ได้)
 */
const PASSWORD = process.env.E2E_PASSWORD ?? "ChangeMe!2026";

export const ACCOUNTS = {
  student: { email: "student@krirk.ac.th", password: PASSWORD, home: /\/dashboard/ },
  instructor: { email: "instructor@krirk.ac.th", password: PASSWORD, home: /\/dashboard/ },
  admin: { email: "admin@krirk.ac.th", password: PASSWORD, home: /\/dashboard/ },
} as const;

export type AccountName = keyof typeof ACCOUNTS;

export const STATE_FILE: Record<AccountName, string> = {
  student: "tests/e2e/.auth/student.json",
  instructor: "tests/e2e/.auth/instructor.json",
  admin: "tests/e2e/.auth/admin.json",
};

/** ผู้เรียนเป็น session ตั้งต้นของทุก project */
export const STUDENT_STATE = STATE_FILE.student;

/** ไม่เก็บ session — ใช้กับเทสต์ที่ต้องเป็นผู้เยี่ยมชมที่ยังไม่ล็อกอิน */
export const ANONYMOUS = { cookies: [], origins: [] };
