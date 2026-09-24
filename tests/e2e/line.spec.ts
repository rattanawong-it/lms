import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { STATE_FILE } from "./constants";

/**
 * M12 · FR-12.1/12.4 — เชื่อมต่อ/ยกเลิก LINE ผ่าน webhook จำลอง (ยังไม่มี LINE OA จริง — phase-3-plan Q2)
 *
 * ต้องเปิด LINE ใน `.env` ของ dev server (LINE_CHANNEL_SECRET/ACCESS_TOKEN + LINE_API_URL ชี้พอร์ตที่ไม่มีบริการ)
 * ใช้บัญชีผู้สอน — ผู้เรียนถูกเทสต์หน้าตั้งค่าแจ้งเตือนตรวจสถานะ LINE อยู่ ถ้าผูกพร้อมกันจะชนกัน
 */
const SECRET = process.env.LINE_CHANNEL_SECRET ?? "";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.skip(!SECRET, "ยังไม่ได้เปิด LINE ใน .env");
test.use({ storageState: STATE_FILE.instructor });

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
}

async function webhook(request: APIRequestContext, events: unknown[], signature?: string | null) {
  const body = JSON.stringify({ destination: "Ubot", events });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-line-signature"] = signature ?? sign(body);
  return request.post("/api/line/webhook", { data: body, headers });
}

const message = (lineUserId: string, text: string) => ({
  type: "message",
  replyToken: `reply-${RUN_ID}`,
  source: { type: "user", userId: lineUserId },
  message: { type: "text", id: "1", text },
});

async function requestCode(page: Page): Promise<string> {
  await page.goto("/settings/line");
  const unlinkButton = page.getByRole("button", { name: "ยกเลิกการเชื่อมต่อ" });
  if (await unlinkButton.isVisible()) {
    await unlinkButton.click();
    await expect(page.locator('[data-line-status="unlinked"]')).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("button", { name: /เชื่อมต่อ LINE|ขอรหัสใหม่/ }).click();
  const code = page.locator("[data-line-code]");
  await expect(code).toHaveText(/^\d{6}$/, { timeout: 15_000 });
  return (await code.textContent())!.trim();
}

test("หน้า LINE แสดงวิธีเชื่อมต่อ ลิงก์เพิ่มเพื่อน และไม่ล้นจอ", async ({ page }) => {
  await page.goto("/settings/line");
  await expect(page.getByRole("link", { name: "LINE", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-line-status]")).toBeVisible({ timeout: 30_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("webhook ที่ไม่มี/ลายเซ็นผิดถูกปฏิเสธ", async ({ request }) => {
  expect((await webhook(request, [], null)).status()).toBe(401);
  expect((await webhook(request, [], "bm90LWEtcmVhbC1zaWduYXR1cmU=")).status()).toBe(401);
  // ปุ่ม Verify ใน LINE Developers ส่ง events ว่าง
  expect((await webhook(request, [])).status()).toBe(200);
});

test.describe("ผูก → unfollow → ผูกใหม่ → ยกเลิกจากเว็บ", () => {
  test.describe.configure({ mode: "serial" });

  test("ส่งรหัสในแชท → เชื่อมต่อสำเร็จ · รหัสใช้ซ้ำไม่ได้ · unfollow แล้วหลุด (FR-12.1 · FR-12.4)", async ({ page, request }, info) => {
    // ผูก/ยกเลิกบัญชีผู้สอนที่ทุก project ใช้ร่วมกัน — รันครั้งเดียว
    test.skip(info.project.name !== "desktop", "เขียนข้อมูลร่วม รันครั้งเดียวพอ");
    const lineUser = `U${RUN_ID}`;

    const code = await requestCode(page);
    expect((await webhook(request, [message(lineUser, code.replace(/(\d{3})/, "$1 "))])).status()).toBe(200);
    await page.getByRole("button", { name: "ตรวจสอบสถานะ" }).click();
    await expect(page.locator('[data-line-status="linked"]')).toBeVisible({ timeout: 15_000 });

    // ช่อง LINE ในหน้าตั้งค่าแจ้งเตือนใช้ได้แล้ว
    await page.goto("/settings/notifications");
    await expect(page.getByLabel("ได้รับคะแนน ทางLINE", { exact: true })).toBeEnabled();

    // รหัสถูกใช้ไปแล้ว — บัญชี LINE อื่นเอามาผูกซ้ำไม่ได้ (ยังเป็นของ lineUser เดิม)
    expect((await webhook(request, [message(`U${RUN_ID}x`, code)])).status()).toBe(200);
    await page.goto("/settings/line");
    await expect(page.locator('[data-line-status="linked"]')).toBeVisible();

    expect(
      (await webhook(request, [{ type: "unfollow", source: { type: "user", userId: `U${RUN_ID}x` } }])).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator('[data-line-status="linked"]')).toBeVisible();

    expect((await webhook(request, [{ type: "unfollow", source: { type: "user", userId: lineUser } }])).status()).toBe(200);
    await page.reload();
    await expect(page.locator('[data-line-status="unlinked"]')).toBeVisible();
  });

  test("ผูกใหม่แล้วกดยกเลิกจากเว็บ (FR-12.4)", async ({ page, request }, info) => {
    test.skip(info.project.name !== "desktop", "เขียนข้อมูลร่วม รันครั้งเดียวพอ");

    const code = await requestCode(page);
    expect((await webhook(request, [message(`U${RUN_ID}w`, code)])).status()).toBe(200);
    await page.getByRole("button", { name: "ตรวจสอบสถานะ" }).click();
    await expect(page.locator('[data-line-status="linked"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "ยกเลิกการเชื่อมต่อ" }).click();
    await expect(page.getByText("ยกเลิกการเชื่อมต่อ LINE แล้ว").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-line-status="unlinked"]')).toBeVisible();
  });
});
