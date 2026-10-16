import { expect, test, type Page } from "@playwright/test";
import { ANONYMOUS } from "./constants";
import { runFixture } from "./helpers";
import type { AvatarFixture, AvatarState } from "./support/avatar-fixture";

/**
 * M01 · FR-01.5 — อัปโหลด/เปลี่ยน/ลบรูปโปรไฟล์ (system-design §5.9)
 * ใช้ผู้ใช้ชั่วคราวที่เข้าด้วย Google และมี session ตรงใน DB — ไม่กินโควตาล็อกอิน
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** PNG 40×20 — ไม่ใช่สี่เหลี่ยมจัตุรัส เพื่อให้ผ่านทางครอปกึ่งกลาง */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAfElEQVR4nO3NkRbCYBiA4Z+iKIqiKIqiKIp2XhhFURRFUTSKolE0GkVRNOq8MIqiaLSr2IX0PTfwJBOOcIwTnOIM57jAJa5wjRvcYoY57nCPBzziCc94wQKveMMS71hhjQ984gsbfGOLH/ziDzvsSRFHHHHEEUccccT/Ew9zZ9jdQjOCLQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });
test.use({ storageState: ANONYMOUS });
test.slow();

const fixtures = new Map<string, AvatarFixture>();
const state = (f: AvatarFixture) => runFixture<AvatarState>("avatar-fixture.ts", "state", f);

test.beforeAll(({}, info) => {
  fixtures.set(info.project.name, runFixture<AvatarFixture>("avatar-fixture.ts", "setup", { tag: `${info.project.name}-${RUN_ID}` }));
});

test.afterAll(() => {
  for (const f of fixtures.values()) runFixture("avatar-fixture.ts", "cleanup", f);
});

test.beforeEach(async ({ context, baseURL }, info) => {
  const f = fixtures.get(info.project.name)!;
  // next start ใช้ชื่อ __Secure- ส่วน next dev ไม่ใช้ — ใส่ทั้งสองแบบให้รันได้กับทั้งคู่
  await context.addCookies(
    ["__Secure-krirk-lms.session_token", "krirk-lms.session_token"].map((name) => ({
      name,
      value: f.cookie,
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    })),
  );
});

async function choose(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
}

test("อัปโหลด → เปลี่ยน → ลบรูปโปรไฟล์ และไฟล์เดิมถูกลบทุกครั้ง", async ({ page }, info) => {
  const f = fixtures.get(info.project.name)!;
  await page.goto("/settings/profile");
  await expect(page.getByRole("button", { name: "เปลี่ยนรูป" })).toBeVisible();

  // ครั้งแรก — แทนรูปจาก Google (ไม่ใช่ไฟล์ของระบบ ไม่มีอะไรให้ลบ)
  await choose(page);
  await expect.poll(async () => (await state(f)).image).toMatch(/^\/api\/media\//);
  const first = await state(f);
  expect(first.assets).toHaveLength(1);
  const [asset] = first.assets;
  expect(asset.key).toMatch(/^avatar\//);
  expect(asset.mime).toBe("image/webp"); // เบราว์เซอร์ย่อ/แปลงก่อนอัปโหลด
  expect(asset.status).toBe("READY");
  expect(first.image).toBe(`/api/media/${asset.id}`);

  await expect(page.getByRole("img", { name: /^รูปโปรไฟล์ของ/ })).toHaveAttribute("src", first.image!);
  const served = await page.request.get(first.image!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/webp");

  // เปลี่ยนรูป — ไฟล์เดิมถูกลบทันที
  await page.reload();
  await choose(page);
  await expect.poll(async () => (await state(f)).image).not.toBe(first.image);
  const second = await state(f);
  expect(second.assets).toHaveLength(1);
  expect(second.assets[0].id).not.toBe(asset.id);
  expect((await page.request.get(first.image!)).status()).toBe(404);

  // ลบรูป — กลับไปใช้ตัวอักษรแรกของชื่อ
  await page.reload();
  await page.getByRole("button", { name: "ลบรูป" }).click();
  await expect(page.getByRole("button", { name: "อัปโหลดรูป" })).toBeVisible();
  const third = await state(f);
  expect(third.image).toBeNull();
  expect(third.assets).toHaveLength(0);
  expect(third.audit).toEqual(["user.avatar.update", "user.avatar.update", "user.avatar.remove"]);
});

test("ขอ presign รูปโปรไฟล์ได้เฉพาะรูปเล็ก และตั้งรูปผ่าน Better Auth ตรง ๆ ไม่ได้", async ({ page }) => {
  await page.goto("/settings/profile");
  const presign = (data: object) =>
    page.request.post("/api/upload/presign", {
      data: { kind: "IMAGE", mime: "image/webp", size: 1000, originalName: "a.webp", purpose: "avatar", ...data },
    });

  expect((await presign({ kind: "VIDEO", mime: "video/mp4" })).status()).toBe(400);
  expect((await presign({ size: 2 * 1024 * 1024 })).status()).toBe(400);
  // ไม่มี purpose = อัปโหลดทั่วไป ต้องเป็นผู้สอนขึ้นไป
  expect((await presign({ purpose: undefined })).status()).toBe(403);

  const direct = await page.request.post("/api/auth/update-user", { data: { image: "https://evil.example/x.png" } });
  expect(direct.status()).toBe(404);
});
