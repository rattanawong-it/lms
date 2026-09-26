// @vitest-environment node
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bahtText } from "@/features/commerce/lib/baht-text";
import { buddhistYear, formatReceiptNo } from "@/features/commerce/lib/receipt-number";
import { buildReceiptModel, type ReceiptInput } from "@/features/commerce/lib/receipt-model";
import { renderReceiptPdf } from "@/features/commerce/lib/receipt-pdf";
import { parseSeller, sellerSchema } from "@/features/settings/schemas";

describe("เลขที่ใบเสร็จ", () => {
  it("ปี พ.ศ. ตามเวลาไทย", () => {
    expect(buddhistYear(new Date("2026-09-26T05:00:00Z"))).toBe(2569);
    // 31 ธ.ค. 2026 17:30 UTC = 1 ม.ค. 2027 00:30 เวลาไทย
    expect(buddhistYear(new Date("2026-12-31T17:30:00Z"))).toBe(2570);
    expect(buddhistYear(new Date("2026-12-31T16:59:59Z"))).toBe(2569);
  });

  it("รูปแบบ RC2569-000001", () => {
    expect(formatReceiptNo(2569, 1)).toBe("RC2569-000001");
    expect(formatReceiptNo(2569, 123456)).toBe("RC2569-123456");
  });
});

describe("bahtText", () => {
  it.each([
    [0, "ศูนย์บาทถ้วน"],
    [99000, "เก้าร้อยเก้าสิบบาทถ้วน"],
    [100, "หนึ่งบาทถ้วน"],
    [1100, "สิบเอ็ดบาทถ้วน"],
    [2100, "ยี่สิบเอ็ดบาทถ้วน"],
    [10100, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [60000, "หกร้อยบาทถ้วน"],
    [123450, "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"],
    [25, "ยี่สิบห้าสตางค์"],
    [10000000, "หนึ่งแสนบาทถ้วน"],
    [100000100, "หนึ่งล้านเอ็ดบาทถ้วน"],
    [1200000000, "สิบสองล้านบาทถ้วน"],
  ])("%i สตางค์ → %s", (satang, text) => {
    expect(bahtText(satang)).toBe(text);
  });

  it("ค่าติดลบ/ไม่ใช่จำนวนเต็ม → throw", () => {
    expect(() => bahtText(-1)).toThrow();
    expect(() => bahtText(1.5)).toThrow();
  });
});

describe("ข้อมูลผู้ขาย (/admin/settings)", () => {
  it("เลขผู้เสียภาษี 13 หลัก · ตัดขีด/ช่องว่าง · ช่องว่างเป็น null", () => {
    expect(sellerSchema.parse({ name: " มหาวิทยาลัยเกริก ", taxId: "0-9940-00123-45-6", address: "", phone: " " })).toEqual({
      name: "มหาวิทยาลัยเกริก",
      taxId: "0994000123456",
      address: null,
      phone: null,
    });
    const bad = sellerSchema.safeParse({ name: "ม", taxId: "12345" });
    expect(bad.error?.issues.map((i) => i.message)).toEqual([
      "ชื่อผู้ขายต้องยาวอย่างน้อย 2 ตัวอักษร",
      "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก",
    ]);
  });

  it("ยังไม่ได้ตั้ง → ใช้ชื่อระบบ", () => {
    expect(parseSeller(null, "KRIRK LMS")).toEqual({ name: "KRIRK LMS", taxId: null, address: null, phone: null });
  });
});

const input: ReceiptInput = {
  receiptNo: "RC2569-000042",
  orderId: "cm0000000000000000000001",
  paidAt: new Date("2026-09-26T05:00:00Z"),
  courseTitle: "การทำบัญชีและการจัดทำงบกำไรขาดทุน",
  subtotal: "990.00",
  discount: "198.00",
  amount: "792.00",
  couponCode: "WELCOME20",
  method: "promptpay",
  billing: {
    seller: { name: "สำนักการศึกษาต่อเนื่อง", taxId: "0994000123456", address: "เลขที่ 3 ถนนรามอินทรา แขวงอนุสาวรีย์", phone: null },
    buyer: { name: "สมชาย ใจดี", email: "somchai@example.com" },
  },
};

/** เดินทุกสตริงในโมเดล */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

describe("buildReceiptModel", () => {
  const model = buildReceiptModel(input);

  it("ไม่มี `ำ` หลุดเข้า PDF (ทุกสตริงผ่าน pdfText)", () => {
    const strings = allStrings(model);
    expect(strings.length).toBeGreaterThan(20);
    expect(strings.filter((s) => s.includes("ำ"))).toEqual([]);
  });

  it("ยอด · ส่วนลด · จำนวนเงินตัวอักษร · วันที่ พ.ศ.", () => {
    expect(model.meta).toContainEqual({ label: "เลขที่", value: "RC2569-000042" });
    expect(model.meta).toContainEqual({ label: "วันที่", value: "26 กันยายน 2569" });
    expect(model.meta).toContainEqual({ label: "ชําระโดย", value: "PromptPay" });
    expect(model.totals.map((t) => [t.label.join(""), t.value])).toEqual([
      ["รวมเป็นเงิน", "฿990"],
      ["ส่วนลด (คูปอง WELCOME20)", "−฿198"],
      ["จํานวนเงินที่ชําระ", "฿792"],
    ]);
    expect(model.amountText).toBe("(เจ็ดร้อยเก้าสิบสองบาทถ้วน)");
    expect(model.seller.lines.map((l) => l.join(""))).toEqual([
      "เลขที่ 3 ถนนรามอินทรา แขวงอนุสาวรีย์",
      "เลขประจําตัวผู้เสียภาษี 0994000123456",
    ]);
  });

  it("ไม่มีส่วนลด → แสดงแค่ยอดชำระ", () => {
    const plain = buildReceiptModel({ ...input, discount: "0.00", amount: "990.00", couponCode: null });
    expect(plain.totals).toHaveLength(1);
  });

  it("เรนเดอร์ PDF ได้", { timeout: 60_000 }, async () => {
    const pdf = await renderReceiptPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // ตรวจด้วยตาระหว่างพัฒนา: RECEIPT_PDF_OUT=ไฟล์.pdf npx vitest run tests/unit/receipt.test.ts
    if (process.env.RECEIPT_PDF_OUT) writeFileSync(process.env.RECEIPT_PDF_OUT, pdf);
  });
});
