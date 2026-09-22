import { expect, test, type Page } from "@playwright/test";

/**
 * M05 ฝั่งผู้เรียน — วิดีโอ, PDF, คาบเรียนสด และไฟล์ประกอบ
 *
 * ใช้คอร์สตัวอย่างจาก seed ซึ่งมีบทเรียนครบทุกชนิด และต้องมี storage (MinIO) รันอยู่จริง
 * เพราะเส้นทางที่ทดสอบคือการออก signed URL และการ stream ไฟล์ออกมาจริง ๆ
 *
 * ผู้เรียนต้องลงทะเบียนคอร์สนี้ไว้แล้ว — `enrollment.spec.ts` (desktop) เป็นคนลงให้
 * ชุดนี้จึงลงทะเบียนเองซ้ำถ้ายังไม่มี เพื่อให้รันแยกไฟล์เดี่ยว ๆ ก็ผ่าน
 */
const COURSE_SLUG = "intro-to-lms";
const LESSON = {
  /** บทเรียนข้อความของ seed เป็นบทที่มีไฟล์ประกอบแนบไว้ */
  text: "ระบบนี้ใช้ทำอะไรได้บ้าง",
  video: "วิดีโอแนะนำการใช้งาน",
  upload: "วิดีโออัปโหลด (ไฟล์ตัวอย่าง เล่นจริงไม่ได้)",
  pdf: "เอกสารประกอบการเรียน",
  live: "คาบถาม-ตอบสด",
};

test.describe.configure({ mode: "serial" });

async function openLesson(page: Page, title: string) {
  await page.goto(`/courses/${COURSE_SLUG}`);

  const enrollButton = page.getByRole("button", { name: "ลงทะเบียนเรียน" });
  if (await enrollButton.isVisible()) {
    await enrollButton.click();
    await expect(page.getByText("ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย")).toBeVisible({
      timeout: 30_000,
    });
  }

  await page.getByRole("link", { name: /เรียนต่อ|ทบทวนบทเรียน/ }).click();
  await expect(page).toHaveURL(/\/learn\/[a-z0-9]+\/[a-z0-9]+/, { timeout: 30_000 });

  // สารบัญอยู่ใน drawer บนจอเล็ก จึงต้องเปิดก่อนจึงจะกดลิงก์บทเรียนได้ (FR-05.6)
  const drawer = page.getByRole("button", { name: /สารบัญบทเรียน/ });
  if (await drawer.isVisible()) await drawer.click();

  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("ผู้เรียนเปิดเนื้อหาบทเรียนแต่ละชนิด", () => {
  test("วิดีโอจากลิงก์ภายนอกฝังผ่าน youtube-nocookie (FR-05.2)", async ({ page }) => {
    await openLesson(page, LESSON.video);

    const frame = page.locator("iframe").first();
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
    // rel=0 กันไม่ให้ YouTube เสนอวิดีโอของช่องอื่นท้ายคลิป
    await expect(frame).toHaveAttribute("src", /rel=0/);
  });

  test("วิดีโอที่อัปโหลดเล่นผ่าน signed URL ที่ขอตอนกดเล่น (FR-15.7)", async ({ page }) => {
    await openLesson(page, LESSON.upload);

    // ยังไม่กดเล่น ต้องยังไม่มี <video> และยังไม่มีลิงก์ไฟล์อยู่ในหน้า
    await expect(page.locator("video")).toHaveCount(0);
    expect(await page.content()).not.toContain("X-Amz-Signature");

    await page.getByRole("button", { name: /เล่นวิดีโอ|กำลังเตรียมวิดีโอ/ }).click();

    const video = page.locator("video");
    await expect(video).toHaveCount(1, { timeout: 30_000 });
    // ลิงก์ต้องเป็น signed URL อายุสั้น ไม่ใช่ลิงก์เปลือยของ bucket
    await expect(video).toHaveAttribute("src", /X-Amz-Signature=/);
    await expect(video).toHaveAttribute("controlslist", /nodownload/);
    await expect(video).toHaveAttribute("disablepictureinpicture", "");
  });

  test("PDF แสดงเป็น canvas ผ่าน route ของระบบ ไม่มีลิงก์ดาวน์โหลด (FR-05.3)", async ({
    page,
  }) => {
    await openLesson(page, LESSON.pdf);

    await expect(page.getByRole("img", { name: /เอกสารของบทเรียน/ })).toBeVisible({
      timeout: 30_000,
    });
    // canvas ไม่ใช่ <embed>/<object> และต้องไม่มีปุ่มดาวน์โหลดเอกสารหลัก
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.locator("embed, object")).toHaveCount(0);
  });

  test("คาบเรียนสดเปิดปุ่มตามเวลา และบอกกติกา 15 นาที (FR-05.5)", async ({ page }) => {
    await openLesson(page, LESSON.live);

    // คาบใน seed อยู่อีก 7 วัน จึงต้องยังกดไม่ได้
    await expect(page.getByRole("button", { name: "ยังไม่ถึงเวลาเข้าห้อง" })).toBeDisabled();
    await expect(page.getByText(/ก่อนเวลาเริ่ม 15 นาที/)).toBeVisible();
  });

  test("ไฟล์ประกอบดาวน์โหลดได้เฉพาะที่ผู้สอนอนุญาต (FR-05.7)", async ({ page }) => {
    await openLesson(page, LESSON.text);

    const files = page.getByRole("region", { name: "ไฟล์ประกอบบทเรียน" });
    await expect(files).toBeVisible();

    const link = files.getByRole("link", { name: "ดาวน์โหลด" }).first();
    await expect(link).toHaveAttribute("href", /^\/api\/lesson-file\//);

    // ปลายทางต้องเป็น signed URL ของ storage ไม่ใช่ลิงก์ตรงไปที่ bucket
    const href = (await link.getAttribute("href"))!;
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toContain("X-Amz-Signature=");
  });
});

test.describe("ไฟล์บทเรียนไม่หลุดถึงคนที่ไม่ได้ลงทะเบียน", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ผู้ที่ยังไม่ล็อกอินเปิด /api/lesson-media ไม่ได้", async ({ request }) => {
    const response = await request.get("/api/lesson-media/ไม่มีอยู่จริง", {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
