import { expect, test } from "@playwright/test";
import { STATE_FILE } from "./constants";

/**
 * M09 · FR-09.6/09.7/09.9 — หน้า Score Curve ของผู้ดูแล
 *
 * เกณฑ์ทั้งระบบถูกเทสต์อื่นใช้คำนวณเกรดพร้อมกัน (เช่น gradebook.spec "84 · A") จึง**ไม่เปลี่ยนค่าจริง** —
 * ทดลองกรอกค่าผิดให้เห็นการตรวจ แล้วบันทึกค่าเดิมกลับเพื่อยืนยันว่าบันทึกและเปิดกลับมาได้
 * การเปลี่ยนเกณฑ์/โหมดที่มีผลกับเกรดจริงทดสอบในคอร์สของตัวเองที่ gradebook.spec
 */

test.describe("ผู้ดูแลระบบ", () => {
  test.use({ storageState: STATE_FILE.admin });

  test("เห็นเกณฑ์จริง (Q6) ทั้งสองส่วน ค่ามาจาก DB", async ({ page }) => {
    await page.goto("/admin/score-curve");
    await expect(page.getByRole("heading", { name: "เกณฑ์คะแนน (Score Curve)", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    const grades = page.locator('[data-curve-section="grades"]');
    const passFail = page.locator('[data-curve-section="passFail"]');
    await expect(grades.locator("[data-curve-row]")).toHaveCount(8);
    await expect(passFail.locator("[data-curve-row]")).toHaveCount(2);
    await expect(page.getByLabel("Min ของ B+")).toHaveValue("75");
    await expect(page.getByLabel("Max ของ B+")).toHaveValue("79");
    await expect(page.getByLabel("Min ของ S")).toHaveValue("50");
    await expect(page.getByLabel("Max ของ U")).toHaveValue("49");
    await expect(grades.locator("[data-curve-status]")).toHaveText(/ครบ 0–100/);
  });

  test("ตรวจช่วงคะแนนก่อนบันทึก: Min > Max · ซ้อนทับ · ช่องว่าง (FR-09.9)", async ({ page }) => {
    await page.goto("/admin/score-curve");
    const grades = page.locator('[data-curve-section="grades"] [data-curve-status]');
    const passFail = page.locator('[data-curve-section="passFail"] [data-curve-status]');

    await page.getByLabel("Max ของ B+").fill("80");
    await expect(grades).toHaveText(/ช่วงของ B\+ \(75–80\) กับ A \(80–100\) ซ้อนทับกัน/);
    await page.getByRole("button", { name: "บันทึกเกณฑ์" }).click();
    await expect(page.getByText("ช่วงคะแนนยังไม่ถูกต้อง").first()).toBeVisible();
    await page.getByLabel("Max ของ B+").fill("79");
    await expect(grades).toHaveText(/ครบ 0–100/);

    await page.getByLabel("Min ของ S").fill("101");
    await expect(passFail).toHaveText("S: Min ต้องอยู่ระหว่าง 0–100");
    await page.getByLabel("Min ของ S").fill("60");
    await expect(passFail).toHaveText("คะแนน 50–59 ไม่อยู่ในช่วงใดเลย");
    await page.getByLabel("Max ของ U").fill("60");
    await expect(passFail).toHaveText(/ช่วงของ U \(0–60\) กับ S \(60–100\) ซ้อนทับกัน/);
    await page.getByLabel("Max ของ U").fill("49");
    await page.getByLabel("Max ของ S").fill("40");
    await expect(passFail).toHaveText("S: Min ต้องไม่มากกว่า Max");
    await page.getByLabel("Max ของ S").fill("100");
    await page.getByLabel("Min ของ S").fill("50.555");
    await expect(passFail).toHaveText("S: Min ละเอียดได้ไม่เกิน 2 ตำแหน่ง");
    await page.getByLabel("Min ของ S").fill("50");
    await expect(passFail).toHaveText(/ครบ 0–100/);
  });

  test("บันทึกแล้วเปิดกลับมาแก้ได้", async ({ page }) => {
    await page.goto("/admin/score-curve");
    await page.getByRole("button", { name: "บันทึกเกณฑ์" }).click();
    await expect(page.getByText("บันทึกเกณฑ์คะแนนแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByLabel("Max ของ A")).toHaveValue("100");
    await expect(page.getByText(/แก้ล่าสุด .* โดย /).first()).toBeVisible();
  });
});

test.describe("ผู้ดูแลคณะ (FR-09.7)", () => {
  test.use({ storageState: STATE_FILE.deptAdmin });

  test("เห็นเฉพาะคณะของตัวเอง · เปิดเกณฑ์ทั้งระบบไม่ได้", async ({ page }) => {
    await page.goto("/admin/score-curve");
    await expect(page.getByRole("heading", { name: "เกณฑ์ของคณะวิทยาศาสตร์และเทคโนโลยี" })).toBeVisible({
      timeout: 30_000,
    });
    // มีขอบเขตเดียว จึงไม่มีตัวเลือกขอบเขต
    await expect(page.getByLabel("ขอบเขต")).toHaveCount(0);

    // forbidden() เรียกในหน้า (ไม่ใช่ layout) และหน้านี้มี loading.tsx — สถานะเป็น 200 จึงตรวจจากหน้า 403 แทน (CLAUDE.md §6)
    await page.goto("/admin/score-curve?scope=system");
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึงหน้านี้" })).toBeVisible();
  });

  test("ตั้งเกณฑ์ของคณะเองแล้วกลับไปใช้เกณฑ์ชั้นบนได้", async ({ page }, testInfo) => {
    // เขียนแถว ScoreCurve ของคณะจริง — รันโปรเจกต์เดียวไม่ให้ desktop/mobile แย่งสถานะกัน
    test.skip(testInfo.project.name !== "desktop", "เขียนข้อมูลร่วม รันครั้งเดียวพอ");

    await page.goto("/admin/score-curve");
    const form = page.locator("[data-score-curve]");
    // บันทึกค่าเดิมที่รับมาจากชั้นบน — เกรดของคอร์สในคณะไม่เปลี่ยน
    await page.getByRole("button", { name: "บันทึกเกณฑ์" }).click();
    await expect(page.getByText("บันทึกเกณฑ์คะแนนแล้ว").first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(form.getByText("คณะตั้งเกณฑ์เอง")).toBeVisible();
    await expect(page.getByText(/แก้ล่าสุด .* โดย ผู้ดูแลคณะวิทยาศาสตร์/)).toBeVisible();

    await page.getByRole("button", { name: "กลับไปใช้เกณฑ์ชั้นบน" }).click();
    await expect(form.getByText(/^ใช้.*อยู่$/)).toBeVisible({ timeout: 15_000 });
  });
});

test("ผู้เรียนและผู้สอนเข้าหน้าเกณฑ์กลางไม่ได้", async ({ browser }) => {
  for (const account of ["student", "instructor"] as const) {
    const context = await browser.newContext({ storageState: STATE_FILE[account] });
    const response = await (await context.newPage()).goto("/admin/score-curve");
    expect(response?.status()).toBe(403);
    await context.close();
  }
});
