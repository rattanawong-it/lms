import { expect, test } from "@playwright/test";
import { ACCOUNTS, ANONYMOUS, STATE_FILE } from "./constants";
import { findMail, runFixture } from "./helpers";
import type { PrivacyFixture } from "./support/privacy-fixture";

/**
 * M17 · FR-17.1–17.4 — audit log · ตั้งค่าระบบ · PDPA (phase-3-plan ขั้น 7)
 * ผู้ขอลบบัญชีเป็นผู้ใช้ชั่วคราวที่เตรียมตรงใน DB (โควตาล็อกอินเต็มแล้ว) · ผู้เรียนจริงทดสอบแค่ส่งคำขอแล้วยกเลิก
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe.configure({ mode: "serial" });
test.slow();

const fixtures = new Map<string, PrivacyFixture>();

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("privacy-fixture.ts", "cleanup", f);
  runFixture("privacy-fixture.ts", "resetStudent", { email: ACCOUNTS.student.email });
});

test("เตรียมผู้ขอลบบัญชี", async ({}, info) => {
  const p = info.project.name;
  fixtures.set(
    p,
    runFixture<PrivacyFixture>("privacy-fixture.ts", "setup", { tag: `${p}-${RUN_ID}`, instructorEmail: ACCOUNTS.instructor.email }),
  );
});

test.describe("ผู้เรียน", () => {
  test.use({ storageState: STATE_FILE.student });

  test("ดาวน์โหลดข้อมูลของตนเองเป็น JSON — มีเฉพาะข้อมูลของตัวเอง", async ({ page }) => {
    await page.goto("/settings/privacy");
    await expect(page.getByRole("heading", { name: "ดาวน์โหลดข้อมูลของฉัน" })).toBeVisible();

    const res = await page.request.get("/api/privacy/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    const data = (await res.json()) as { profile: { email: string }; enrollments: unknown[] };
    expect(data.profile.email).toBe(ACCOUNTS.student.email);
    expect(Array.isArray(data.enrollments)).toBe(true);

    const text = JSON.stringify(data);
    for (const other of [ACCOUNTS.instructor.email, ACCOUNTS.admin.email, ACCOUNTS.deptAdmin.email]) {
      expect(text).not.toContain(other);
    }
    // ไม่มีรหัสผ่าน/โทเค็นหลุดออกไป
    expect(text).not.toMatch(/"(password|accessToken|refreshToken|idToken|token)"/);
  });

  test("ขอลบบัญชี: รหัสผ่านผิดไม่ผ่าน → ถูกแล้วรอพิจารณา → ยกเลิกเองได้", async ({ page }, info) => {
    // desktop กับ mobile ใช้ผู้เรียนคนเดียวกัน — สถานะคำขอเป็นของบัญชี จึงทดสอบฝั่งเดียว
    test.skip(info.project.name !== "desktop", "สถานะคำขอผูกกับบัญชีผู้เรียนที่ใช้ร่วมกัน");

    await page.goto("/settings/privacy");
    const form = page.getByRole("form", { name: "ขอลบบัญชี" });
    await form.getByLabel("เหตุผล (ไม่บังคับ)").fill("ทดสอบระบบ");
    await form.getByLabel("ยืนยันด้วยรหัสผ่านปัจจุบัน").fill("รหัสผิดแน่นอน");
    await form.getByRole("button", { name: "ส่งคำขอลบบัญชี" }).click();
    await expect(form.getByText("รหัสผ่านไม่ถูกต้อง")).toBeVisible({ timeout: 15_000 });

    await form.getByLabel("ยืนยันด้วยรหัสผ่านปัจจุบัน").fill(ACCOUNTS.student.password);
    await form.getByRole("button", { name: "ส่งคำขอลบบัญชี" }).click();
    const pending = page.locator("[data-deletion-state=pending]");
    await expect(pending).toBeVisible({ timeout: 15_000 });
    await expect(pending).toContainText("ทดสอบระบบ");

    await pending.getByRole("button", { name: "ยกเลิกคำขอลบบัญชี" }).click();
    await expect(page.getByRole("form", { name: "ขอลบบัญชี" })).toBeVisible({ timeout: 15_000 });
  });

  test("ผู้เรียนเข้าหน้าผู้ดูแลของ M17 ไม่ได้ (NFR-04)", async ({ page }) => {
    for (const path of ["/admin/audit", "/admin/settings", "/admin/deletion-requests"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/บันทึกการใช้งาน|ตั้งค่าระบบ|คำขอลบบัญชี/);
    }
  });
});

test.describe("ผู้ดูแลระบบ", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("ปฏิเสธคำขอพร้อมเหตุผล → ผู้ใช้ได้อีเมลและบัญชียังอยู่", async ({ page }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto("/admin/deletion-requests");
    const card = page.locator(`[data-deletion-request="${f.reject.email}"]`);
    await expect(card).toContainText("ย้ายสถาบัน reject");

    await card.getByRole("button", { name: "ปฏิเสธ" }).click();
    await card.getByLabel("เหตุผลที่ปฏิเสธ (ผู้ใช้จะเห็น)").fill("ยังมีงานค้างส่งในรายวิชา");
    await card.getByRole("button", { name: "ส่งผลการปฏิเสธ" }).click();
    await expect(card).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(() => findMail(f.reject.email, "ผลการพิจารณาคำขอลบบัญชี · KRIRK LMS").then((m) => m.length), { timeout: 15_000 })
      .toBeGreaterThan(0);
    const state = runFixture<{ rejected: { requested: boolean; deleted: boolean } }>("privacy-fixture.ts", "inspect", f);
    expect(state.rejected).toEqual({ requested: false, deleted: false });
  });

  test("อนุมัติคำขอ → anonymize ครบ · ใบประกาศยังตรวจได้แต่ไม่แสดงชื่อจริง · มีใน audit", async ({ page, browser }, info) => {
    const f = fixtures.get(info.project.name)!;
    await page.goto("/admin/deletion-requests");
    const card = page.locator(`[data-deletion-request="${f.approve.email}"]`);
    await card.getByRole("button", { name: "อนุมัติ" }).click();
    await card.getByRole("button", { name: "ยืนยันลบข้อมูล" }).click();
    await expect(card).toBeHidden({ timeout: 15_000 });

    // อีเมลแจ้งผลส่งไปที่อีเมลจริงก่อนถูกลบ
    await expect
      .poll(() => findMail(f.approve.email, "บัญชีของคุณถูกลบแล้ว · KRIRK LMS").then((m) => m.length), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const state = runFixture<{
      approved: { name: string; email: string; phone: string | null; externalId: string | null; deletedAt: string | null; banned: boolean };
      sessions: number;
      accounts: number;
      auditMentions: number;
    }>("privacy-fixture.ts", "inspect", f);
    expect(state.approved).toMatchObject({
      name: "ผู้ใช้ที่ลบบัญชีแล้ว",
      email: `deleted-${f.approve.id}@deleted.invalid`,
      phone: null,
      externalId: null,
      banned: true,
    });
    expect(state.approved.deletedAt).not.toBeNull();
    expect(state.sessions).toBe(0);
    expect(state.accounts).toBe(0);
    expect(state.auditMentions).toBe(0);

    // หน้าตรวจสอบใบประกาศสาธารณะ
    const guest = await browser.newContext({ storageState: ANONYMOUS });
    const verify = await guest.newPage();
    await verify.goto(`/verify/${f.approve.certCode}`);
    await expect(verify.locator("[data-verify-name]")).toHaveText("ผู้ใช้ที่ลบบัญชีแล้ว");
    await guest.close();

    // FR-17.2 — ค้นหาใน audit ตามรหัสข้อมูล แล้วดูค่าก่อน/หลัง
    await page.goto(`/admin/audit?entity=User&entityId=${f.approve.id}`);
    const row = page.locator('[data-audit-row="privacy.deletion.approve"]');
    await expect(row).toBeVisible();
    await row.locator("summary").click();
    await expect(row.getByText("anonymized")).toBeVisible();
  });

  test("หน้าค้นหา audit กรองตาม action ได้", async ({ page }) => {
    await page.goto("/admin/audit?action=privacy.deletion");
    await expect(page.getByRole("heading", { name: "บันทึกการใช้งาน", level: 1 })).toBeVisible();
    const actions = await page.locator("[data-audit-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-audit-row")));
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) expect(a).toMatch(/^privacy\.deletion\./);
  });

  test("ตั้งค่าระบบ: แสดงสถานะอีเมล/LINE และส่งอีเมลทดสอบถึงตนเอง (FR-17.3)", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "ตั้งค่าระบบ", level: 1 })).toBeVisible();
    await expect(page.locator("[data-channel=email]")).toContainText("ตั้งค่าแล้ว");
    await expect(page.locator("[data-channel=line]")).toBeVisible();
    // M18 ขั้น 0 — สถานะผู้ให้บริการชำระเงิน (ไม่แสดงค่า secret)
    await expect(page.locator("[data-channel=payment]")).toContainText("ผู้ให้บริการ");

    const before = (await findMail(ACCOUNTS.admin.email, "ทดสอบการส่งอีเมล · KRIRK LMS")).length;
    await page.getByRole("button", { name: "ส่งอีเมลทดสอบถึงฉัน" }).click();
    await expect(page.getByText(`ส่งอีเมลทดสอบไปที่ ${ACCOUNTS.admin.email} แล้ว`)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => findMail(ACCOUNTS.admin.email, "ทดสอบการส่งอีเมล · KRIRK LMS").then((m) => m.length), { timeout: 15_000 })
      .toBeGreaterThan(before);
  });

  test("ตั้งค่าระบบ: ชื่อระบบต้องไม่ว่าง (ข้อความไทย)", async ({ page }) => {
    await page.goto("/admin/settings");
    const form = page.getByRole("form", { name: "ชื่อระบบและโลโก้" });
    // บันทึกชื่อเดิม — ไม่เปลี่ยนชื่อระบบจริงระหว่างที่เทสต์อื่นรันพร้อมกัน
    await form.getByLabel("ชื่อระบบ").fill("ก");
    await form.getByLabel("ชื่อระบบ").press("Enter");
    await expect(form.getByText("ชื่อระบบต้องยาวอย่างน้อย 2 ตัวอักษร")).toBeVisible({ timeout: 15_000 });
  });
});
