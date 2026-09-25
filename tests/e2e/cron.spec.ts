import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ACCOUNTS, STATE_FILE } from "./constants";
import { findMail } from "./helpers";
import type { CronFixture, CronNotification } from "./support/cron-fixture";

/**
 * FR-12.3 · phase-3-plan ขั้น 3 — cron แจ้งล่วงหน้า
 *
 * เตรียมข้อมูลตรงใน DB (คอร์สเผยแพร่ + งานครบกำหนดใน 5 ชม. + คาบสดเริ่มใน 30 นาที) — ขั้นตอนสร้างผ่าน UI
 * มีเทสต์ของตัวเองแล้ว (assignment/course-builder) · เรียก cron 2 ครั้ง → แจ้งครั้งเดียว ทั้งในแอปและอีเมล
 * ผู้รับอีเมลเป็นบัญชีชั่วคราวที่ใช้ค่าเริ่มต้น — บัญชี student ถูกเทสต์หน้าตั้งค่าเปิด/ปิดอีเมลอยู่
 * ต้องตั้ง `CRON_SECRET` ใน `.env` ของ dev server
 */
const SECRET = process.env.CRON_SECRET ?? "";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.skip(!SECRET, "ยังไม่ได้ตั้ง CRON_SECRET ใน .env");
test.describe.configure({ mode: "serial" });
test.slow();

const auth = { authorization: `Bearer ${SECRET}` };
const assignmentTitle = (p: string) => `งานใกล้ครบกำหนด ${p} ${RUN_ID}`;
const liveTitle = (p: string) => `คาบสดใกล้เริ่ม ${p} ${RUN_ID}`;

/** รันงานกับ DB ใน process แยก (ดู `support/cron-fixture.ts`) */
function fixture<T>(action: string, args: unknown): T {
  const out = execFileSync(
    process.execPath,
    [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("tests/e2e/support/cron-fixture.ts"), action, JSON.stringify(args)],
    { encoding: "utf8" },
  );
  return JSON.parse(out) as T;
}

const fixtures = new Map<string, CronFixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) fixture("cleanup", f);
});

test("ไม่มี/ผิด token → 401 · งานที่ไม่มีอยู่ → 404", async ({ request }) => {
  expect((await request.post("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/live", { headers: { authorization: "Bearer wrong-secret-value" } })).status()).toBe(401);
  expect((await request.post("/api/cron/nope", { headers: auth })).status()).toBe(404);
});

test("เรียก cron 2 ครั้ง → แจ้งครั้งเดียว (ในแอป + อีเมล)", async ({ request }, info) => {
  const p = info.project.name;
  const f = fixture<CronFixture>("setup", {
    tag: `${p}-${RUN_ID}`,
    instructorEmail: ACCOUNTS.instructor.email,
    studentEmail: ACCOUNTS.student.email,
    assignmentTitle: assignmentTitle(p),
    liveTitle: liveTitle(p),
  });
  fixtures.set(p, f);

  for (let i = 0; i < 2; i++) {
    for (const job of ["reminders", "live"]) {
      const res = await request.post(`/api/cron/${job}`, { headers: auth });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ job, items: expect.any(Number), notified: expect.any(Number) });
    }
  }

  const rows = fixture<CronNotification[]>("notifications", f);
  for (const userId of [f.studentId, f.tempUserId]) {
    expect(rows.filter((r) => r.userId === userId).map((r) => r.type).sort()).toEqual(["DUE_SOON", "LIVE_SOON"]);
  }

  // DUE_SOON เปิดอีเมลเป็นค่าเริ่มต้น · LIVE_SOON ปิด (FR-11.3)
  const due = rows.find((r) => r.userId === f.tempUserId && r.type === "DUE_SOON")!;
  expect(due.link).toBe(`/learn/${f.courseId}/${f.lessonId}`);
  await expect.poll(async () => (await findMail(f.tempEmail, due.title)).length, { timeout: 15_000 }).toBe(1);
  // ให้งานหลัง response ของรอบที่ 2 มีเวลาทำ แล้วยืนยันว่าไม่มีฉบับที่สอง
  await new Promise((r) => setTimeout(r, 2_000));
  expect(await findMail(f.tempEmail, due.title)).toHaveLength(1);
});

test("ส่งงานแล้ว/เลื่อนกำหนดส่ง → รอบใหม่แจ้งเฉพาะผู้ที่ยังไม่ส่ง ตามกำหนดใหม่", async ({ request }, info) => {
  const f = fixtures.get(info.project.name)!;
  fixture("submitAndPostpone", f);

  expect((await request.post("/api/cron/reminders", { headers: auth })).status()).toBe(200);
  const due = fixture<CronNotification[]>("notifications", f).filter((r) => r.type === "DUE_SOON");
  expect(due.filter((r) => r.userId === f.tempUserId)).toHaveLength(2);
  expect(due.filter((r) => r.userId === f.studentId)).toHaveLength(1);
});

test.describe("ผู้เรียนเห็นการแจ้งเตือน", () => {
  test.use({ storageState: STATE_FILE.student });

  test("หน้ารวมการแจ้งเตือนแสดงงานใกล้ครบกำหนดและคาบสดอย่างละครั้ง", async ({ page }, info) => {
    const p = info.project.name;
    await page.goto("/notifications");
    await expect(page.getByText(`งาน “${assignmentTitle(p)}” ครบกำหนดส่ง`, { exact: false })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByText(`คาบเรียนสด “${liveTitle(p)}” เริ่ม`, { exact: false })).toHaveCount(1);
  });
});
