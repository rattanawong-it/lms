import { expect, test, type Page } from "@playwright/test";
import { STATE_FILE } from "./constants";
import { teachSearch } from "./helpers";

/**
 * M05 (ฝั่งผู้สอน) — อัปโหลดไฟล์ เขียนเนื้อหา และแนบไฟล์ประกอบ
 *
 * ไฟล์ที่ใช้ทดสอบสร้างในหน่วยความจำ ไม่ผูกกับไฟล์ตัวอย่างในรีโป
 * และต้องมี storage (MinIO) รันอยู่จริง เพราะเส้นทางนี้ทดสอบแยกจาก storage ไม่ได้
 */
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `e2e-content-${RUN_ID}`;
const TITLE = `คอร์สทดสอบเนื้อหา ${RUN_ID}`;

test.describe.configure({ mode: "serial" });

/** PNG 1×1 สีทึบ — เล็กที่สุดที่ยังผ่านการตรวจ magic bytes ฝั่ง server */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** เอกสารข้อความสั้น ๆ สำหรับทดสอบไฟล์ประกอบ (FR-05.7) */
const WORKSHEET = Buffer.from("ใบงานทดสอบอัตโนมัติ", "utf8");

/** ไฟล์ .docx จำลอง — server ตรวจแค่ลายเซ็น ZIP (PK 03 04) ซึ่ง docx ทุกไฟล์มี (FR-05.8) */
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]);

async function gotoSettings(page: Page) {
  await page.goto(teachSearch(TITLE));
  await page.getByRole("link", { name: TITLE }).click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
}

test.describe("ผู้สอนใส่เนื้อหาให้คอร์ส", () => {
  test.use({ storageState: STATE_FILE.instructor });

  test("สร้างคอร์สสำหรับทดสอบเนื้อหา", async ({ page }) => {
    await page.goto("/teach/courses/new");
    await page.getByLabel("ชื่อคอร์ส", { exact: true }).fill(TITLE);
    await page.getByLabel("slug (ใช้ใน URL ของคอร์ส)", { exact: true }).fill(SLUG);
    await page.getByRole("button", { name: "สร้างคอร์ส" }).click();

    await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/, { timeout: 30_000 });
  });

  test("อัปโหลดภาพปกและเขียนคำอธิบายด้วย editor (FR-05.1 · FR-05.4)", async ({ page }) => {
    await gotoSettings(page);

    await page
      .getByLabel("ภาพปก (ไม่บังคับ)", { exact: true })
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });

    // ปุ่ม "เปลี่ยน" จะโผล่ก็ต่อเมื่ออัปโหลดขึ้น storage และ server ยืนยันชนิดไฟล์แล้ว
    await expect(page.getByRole("button", { name: "เปลี่ยน" })).toBeVisible({ timeout: 30_000 });

    const editor = page.getByLabel("คำอธิบายคอร์ส (ไม่บังคับ)", { exact: true });
    await editor.click();
    await editor.pressSequentially("คอร์สนี้สอนการใช้งานระบบตั้งแต่ต้น");
    await page.getByRole("button", { name: "หัวข้อใหญ่" }).click();

    await page.getByRole("button", { name: "บันทึกข้อมูลคอร์ส" }).click();
    await expect(page.getByText("บันทึกข้อมูลคอร์สแล้ว")).toBeVisible({ timeout: 30_000 });

    // ปกและคำอธิบายต้องไปโผล่ที่หน้าคอร์สจริง ผ่าน /api/media ไม่ใช่ลิงก์ตรงของ storage
    await page.goto(`/courses/${SLUG}`);
    const cover = page.locator("aside img").first();
    await expect(cover).toHaveAttribute("src", /%2Fapi%2Fmedia%2F|\/api\/media\//);
    await expect(
      page.getByRole("heading", { name: "คอร์สนี้สอนการใช้งานระบบตั้งแต่ต้น" }),
    ).toBeVisible();
  });

  test("บทเรียน PDF ต้องมีไฟล์ก่อนจึงบันทึกได้ (FR-05.1 · FR-05.3)", async ({ page }) => {
    await gotoSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();

    await page.getByRole("button", { name: "เพิ่มบทแรก" }).click();
    await page.getByLabel("ชื่อบท", { exact: true }).fill("บทที่ 1");
    await page.getByRole("button", { name: "เพิ่มบท", exact: true }).click();
    // อ่านจากหัวข้อของบทโดยตรง — ข้อความล้วนจะไปชนกับ toast ที่มีชื่อบทอยู่ด้วย
    await expect(page.getByRole("heading", { name: /บทที่ 1/ })).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill("เอกสารประกอบ");
    await page.getByRole("combobox", { name: "ชนิดบทเรียน" }).click();
    await page.getByRole("option", { name: "เอกสาร", exact: true }).click();
    await expect(page.getByLabel("ไฟล์เอกสาร", { exact: true })).toBeAttached();

    // ยังไม่แนบไฟล์ → ต้องถูกปฏิเสธ
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText("อัปโหลดไฟล์เอกสารก่อน")).toBeVisible();

    await page
      .getByLabel("ไฟล์เอกสาร", { exact: true })
      .setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: samplePdf() });
    await expect(page.getByRole("button", { name: "เปลี่ยน" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText("เอกสารประกอบ", { exact: true })).toBeVisible();
  });

  test("ผู้สอนเปิดให้ดาวน์โหลด PDF ของบทเรียนได้ (FR-05.9)", async ({ page }) => {
    test.slow();
    await gotoSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();
    await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/);
    const courseId = page.url().match(/\/teach\/courses\/([a-z0-9]+)\//)![1];

    // ค่าตั้งต้นปิด → ไม่มีปุ่ม และเรียกตรงก็ถูกปฏิเสธ
    await page.goto(`/learn/${courseId}`);
    const drawer = page.getByRole("button", { name: /สารบัญบทเรียน/ });
    if (await drawer.isVisible()) await drawer.click();
    await page.getByRole("link", { name: "เอกสารประกอบ" }).click();
    await expect(page.getByRole("heading", { name: "เอกสารประกอบ", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    const lessonId = page.url().split("/").pop()!;
    await expect(page.getByRole("link", { name: "ดาวน์โหลด PDF" })).toHaveCount(0);
    const denied = await page.request.get(`/api/lesson-media/${lessonId}?download=1`, {
      maxRedirects: 0,
    });
    expect(denied.status()).toBe(403);

    await page.goto(`/teach/courses/${courseId}/curriculum`);
    await page.getByRole("button", { name: "แก้ไขบทเรียน เอกสารประกอบ" }).click();
    await page.getByLabel(/ให้ผู้เรียนดาวน์โหลด PDF ได้/).check();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`/learn/${courseId}/${lessonId}`);
    const link = page.getByRole("link", { name: "ดาวน์โหลด PDF" });
    await expect(link).toBeVisible({ timeout: 30_000 });
    const response = await page.request.get((await link.getAttribute("href"))!, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    const location = response.headers()["location"];
    expect(location).toContain("X-Amz-Signature=");
    expect(decodeURIComponent(location)).toContain("attachment");
  });

  test("บทเรียนเอกสาร Word ให้ผู้เรียนดาวน์โหลดไฟล์ต้นฉบับ (FR-05.8)", async ({ page }) => {
    test.slow();
    await gotoSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();
    await expect(page).toHaveURL(/\/teach\/courses\/[a-z0-9]+\/curriculum/);
    const courseId = page.url().match(/\/teach\/courses\/([a-z0-9]+)\//)![1];

    await page.getByRole("button", { name: "เพิ่มบทเรียนในบทนี้" }).click();
    await page.getByLabel("ชื่อบทเรียน", { exact: true }).fill("ใบความรู้ Word");
    await page.getByRole("combobox", { name: "ชนิดบทเรียน" }).click();
    await page.getByRole("option", { name: "เอกสาร", exact: true }).click();

    // mimeType ว่างเหมือนเครื่องที่ไม่รู้จัก .docx — ระบบต้องตัดสินจากนามสกุลเอง
    await page
      .getByLabel("ไฟล์เอกสาร", { exact: true })
      .setInputFiles({ name: "ใบความรู้.docx", mimeType: "", buffer: DOCX });
    await expect(page.getByRole("button", { name: "เปลี่ยน" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "เพิ่มบทเรียน", exact: true }).click();
    await expect(page.getByText("ใบความรู้ Word", { exact: true })).toBeVisible();

    // ผู้สอนเปิดหน้าเรียนในโหมดดูตัวอย่างได้ — เห็นการ์ดดาวน์โหลดแทนตัวอ่าน PDF
    await page.goto(`/learn/${courseId}`);
    const drawer = page.getByRole("button", { name: /สารบัญบทเรียน/ });
    if (await drawer.isVisible()) await drawer.click();
    await page.getByRole("link", { name: "ใบความรู้ Word" }).click();
    await expect(page.getByRole("heading", { name: "ใบความรู้ Word", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("ใบความรู้.docx")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);

    const link = page.getByRole("link", { name: "ดาวน์โหลดเอกสาร" });
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^\/api\/lesson-media\//);
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = response.headers()["location"];
    expect(location).toContain("X-Amz-Signature=");
    expect(decodeURIComponent(location)).toContain("attachment");
  });

  test("แนบไฟล์ประกอบและเปิดสิทธิ์ดาวน์โหลดได้ (FR-05.7)", async ({ page }) => {
    await gotoSettings(page);
    await page.getByRole("link", { name: "จัดสารบัญ" }).click();

    await page.getByRole("button", { name: "ไฟล์ประกอบของ เอกสารประกอบ" }).click();
    await expect(page.getByText("ยังไม่มีไฟล์ประกอบในบทเรียนนี้")).toBeVisible();

    await page
      .getByLabel("เพิ่มไฟล์ประกอบ", { exact: true })
      .setInputFiles({ name: "worksheet.txt", mimeType: "text/plain", buffer: WORKSHEET });

    await expect(page.getByText("worksheet.txt", { exact: true })).toBeVisible({ timeout: 30_000 });

    // ค่าตั้งต้นคือดูได้แต่ดาวน์โหลดไม่ได้ ตามแนวทางป้องกันเนื้อหาของ M15
    const downloadable = page.getByRole("checkbox").last();
    await expect(downloadable).not.toBeChecked();
    await downloadable.check();
    await expect(page.getByText(/เปิดให้ดาวน์โหลด/)).toBeVisible({ timeout: 15_000 });
  });
});

/** PDF ที่เปิดได้จริง — สร้างเองเพื่อไม่ต้องเก็บไฟล์ไบนารีไว้ในรีโป (ชุดเดียวกับ prisma/seed.ts) */
function samplePdf(): Buffer {
  const lf = "\n";
  const stream = "BT /F1 18 Tf 60 760 Td (e2e sample) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    [`<< /Length ${stream.length} >>`, "stream", stream, "endstream"].join(lf),
  ];

  let pdf = `%PDF-1.4${lf}`;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj${lf}${body}${lf}endobj${lf}`;
  });

  const xrefAt = pdf.length;
  pdf += `xref${lf}0 ${objects.length + 1}${lf}0000000000 65535 f ${lf}`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n ${lf}`;
  pdf += `trailer${lf}<< /Size ${objects.length + 1} /Root 1 0 R >>${lf}`;
  pdf += `startxref${lf}${xrefAt}${lf}%%EOF${lf}`;

  return Buffer.from(pdf, "latin1");
}
