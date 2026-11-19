import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./constants";
import { runFixture } from "./helpers";
import type { CaseName, StorageCleanupFixture } from "./support/storage-cleanup-fixture";

/**
 * CHANGELOG #55 — cron `cleanup` ลบไฟล์ที่ไม่มีที่ใดอ้างถึง (ผ่อนผัน 30 วัน · อัปโหลดไม่จบ 1 วัน)
 *
 * เตรียม Asset ย้อนเวลาไว้ใน DB ครบทุกแบบของการอ้างถึง แล้วเรียก cron จริง
 * รันเฉพาะโปรเจกต์ desktop — cron ทั้งระบบรันซ้อนกันสองโปรเจกต์จะแย่งลบไฟล์ชุดเดียวกัน
 * ต้องตั้ง `CRON_SECRET` ใน `.env` ของ dev server
 */
const SECRET = process.env.CRON_SECRET ?? "";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const auth = { authorization: `Bearer ${SECRET}` };

/** ชื่อ → ควรถูกลบไหม (ตรงกับที่ fixture สร้าง) */
const SHOULD_DELETE: Record<CaseName, boolean> = {
  orphanOld: true,
  uploadingOld: true,
  orphanRecent: false,
  lessonVideo: false,
  attachment: false,
  cover: false,
  richText: false,
  certificateLogo: false,
  avatar: false,
};

test.skip(!SECRET, "ยังไม่ได้ตั้ง CRON_SECRET ใน .env");
test.describe.configure({ mode: "serial" });

let f: StorageCleanupFixture | null = null;

test.afterAll(() => {
  if (f) runFixture("storage-cleanup-fixture.ts", "cleanup", f);
});

test("ลองรันนับอย่างเดียว แล้วรันจริงลบเฉพาะไฟล์ที่ไม่มีใครใช้", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop", "cron ทั้งระบบ — รันโปรเจกต์เดียวพอ");
  test.slow();
  f = runFixture<StorageCleanupFixture>("storage-cleanup-fixture.ts", "setup", {
    tag: RUN_ID,
    instructorEmail: ACCOUNTS.instructor.email,
  });
  const all = Object.values(f.assets);
  const remaining = () => runFixture<string[]>("storage-cleanup-fixture.ts", "remaining", f).sort();

  const dry = await request.post("/api/cron/cleanup?dryRun=1", { headers: auth });
  expect(dry.status()).toBe(200);
  const dryBody = await dry.json();
  expect(dryBody).toMatchObject({ job: "cleanup", dryRun: true });
  expect(dryBody.assets).toBeGreaterThanOrEqual(2);
  expect(remaining()).toEqual([...all].sort());

  const run = await request.post("/api/cron/cleanup", { headers: auth });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ job: "cleanup", dryRun: false, assetFailed: 0 });

  const kept = (Object.keys(SHOULD_DELETE) as CaseName[]).filter((name) => !SHOULD_DELETE[name]);
  expect(remaining()).toEqual(kept.map((name) => f!.assets[name]).sort());
});
