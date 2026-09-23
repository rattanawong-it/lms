// @vitest-environment node
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  certificateTemplateSchema,
  CODE_PATTERN,
  DEFAULT_CERTIFICATE_TEMPLATE,
  generateCertificateCode,
  normalizeCode,
  parseCertificateTemplate,
} from "@/features/certificates/schemas";
import { fillLine, fillText, pdfText, pdfWords } from "@/features/certificates/lib/text";
import { buildCertificateModel } from "@/features/certificates/lib/model";
import { renderCertificatePdf } from "@/features/certificates/lib/pdf";

const SARA_AM = "ำ";
const vars = {
  name: "นางสาวกิ่งแก้ว ปิ่นทองคำ",
  course: "การทำเว็บแอปพลิเคชันด้วยภาษาไทยสำหรับผู้เริ่มต้น",
  date: "23 กันยายน 2569",
  code: "LMS-2026-8F3K2Q",
};

/** เดินทุกสตริงในค่า (object/array ซ้อนกันได้) */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("ข้อความภาษาไทยก่อนเข้า PDF (ผล spike ขั้น 0)", () => {
  it("แตก ำ เป็น ํา — ตัวอักษรตัวสุดท้ายไม่หาย", () => {
    expect(pdfText("ปิ่นทองคำ")).toBe("ปิ่นทองคํา");
    expect(pdfText("ไม่มีสระอำ")).not.toContain(SARA_AM);
    expect(pdfText("ABC")).toBe("ABC");
  });

  it("ตัดคำภาษาไทยเป็นกล่อง (ขึ้นบรรทัดใหม่ระหว่างคำ) และแปลง ำ ทุกคำ", () => {
    const words = pdfWords("ได้ผ่านการอบรมหลักสูตรคำนวณ");
    expect(words.length).toBeGreaterThan(3);
    expect(words.join("")).toBe(pdfText("ได้ผ่านการอบรมหลักสูตรคำนวณ"));
    expect(words.some((w) => w.includes(SARA_AM))).toBe(false);
  });

  it("**ทุกสตริง** ในโมเดล PDF ไม่มี ำ ดิบหลงเหลือ — กันคนเผลอส่งข้อความดิบ", () => {
    const template = {
      ...DEFAULT_CERTIFICATE_TEMPLATE,
      heading: "ประกาศนียบัตรคำรับรอง",
      body: "ขอรับรองว่า\n{ชื่อ}\nสำเร็จหลักสูตร {คอร์ส}\nรหัส {รหัส} วันที่ {วันที่}",
      signerName: "ผู้อำนวยการ คำดี",
      signerTitle: "ผู้อำนวยการสำนัก",
    };
    const model = buildCertificateModel(template, vars, "https://lms.example/verify/LMS-2026-8F3K2Q");
    const all = strings(model);
    expect(all.length).toBeGreaterThan(10);
    expect(all.filter((s) => s.includes(SARA_AM))).toEqual([]);
  });

  it("ชื่อคนและรหัสเป็นกล่องเดียว ห้ามตัดกลางชื่อ · บรรทัดที่มีแต่ตัวแปรแสดงตัวใหญ่", () => {
    const model = buildCertificateModel(DEFAULT_CERTIFICATE_TEMPLATE, vars, "https://x/verify/c");
    const nameLine = model.lines.find((l) => l.emphasized && l.runs.length === 1);
    expect(nameLine?.runs[0]?.text).toBe(pdfText(vars.name));
    // ชื่อคอร์สยาวตัดคำได้ (ไม่ล้นกรอบ)
    const courseLine = model.lines.find((l) => l.emphasized && l.runs.length > 1);
    expect(courseLine?.runs.map((r) => r.text).join("")).toBe(pdfText(vars.course));
  });

  it("ใส่ตัวแปรในแม่แบบ", () => {
    expect(fillLine("มอบให้ {ชื่อ} ({รหัส})", vars)).toEqual([
      { text: "มอบให้ ", variable: null },
      { text: vars.name, variable: "name" },
      { text: " (", variable: null },
      { text: vars.code, variable: "code" },
      { text: ")", variable: null },
    ]);
    expect(fillText("{ชื่อ}\n{ไม่รู้จัก}", vars)).toBe(`${vars.name}\n{ไม่รู้จัก}`);
  });
});

describe("รหัสและแม่แบบ (FR-10.2 · FR-10.3)", () => {
  it("รหัสรูปแบบ LMS-ปี-XXXXXX ไม่มีตัวที่อ่านสับสน", () => {
    for (let i = 0; i < 200; i += 1) expect(generateCertificateCode(2026)).toMatch(CODE_PATTERN);
    expect(generateCertificateCode(2026, () => 0)).toBe("LMS-2026-222222");
    expect(generateCertificateCode(2026, () => 0.9999)).toBe("LMS-2026-ZZZZZZ");
    expect(normalizeCode(" lms-2026-8f3k2q ")).toBe("LMS-2026-8F3K2Q");
  });

  it("แม่แบบ: ต้องมี {ชื่อ} · ค่าเสียใช้ค่าตั้งต้น", () => {
    const bad = certificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, body: "ไม่มีชื่อ" });
    expect(bad.error?.issues[0]?.message).toBe("ข้อความต้องมี {ชื่อ} ของผู้ได้รับ");
    expect(certificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, heading: "" }).success).toBe(false);
    expect(parseCertificateTemplate(null)).toEqual(DEFAULT_CERTIFICATE_TEMPLATE);
    expect(parseCertificateTemplate({ body: 1 })).toEqual(DEFAULT_CERTIFICATE_TEMPLATE);
    const crlf = certificateTemplateSchema.parse({ ...DEFAULT_CERTIFICATE_TEMPLATE, body: "ก\r\n{ชื่อ}" });
    expect(crlf.body).toBe("ก\n{ชื่อ}");
  });
});

describe("เรนเดอร์ PDF จริง (ฟอนต์ Anuphan ใน repo)", () => {
  it("ได้ไฟล์ PDF หนึ่งหน้า", async () => {
    const model = buildCertificateModel(
      { ...DEFAULT_CERTIFICATE_TEMPLATE, signerName: "รองศาสตราจารย์ ดร.สมชาย ใจดี", signerTitle: "คณบดี" },
      vars,
      "http://localhost:3000/verify/LMS-2026-8F3K2Q",
    );
    const pdf = await renderCertificatePdf(model, { logo: null, signature: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
    // ใช้ตรวจด้วยตาระหว่างพัฒนา: CERT_PDF_OUT=path pnpm test
    if (process.env.CERT_PDF_OUT) writeFileSync(process.env.CERT_PDF_OUT, pdf);
  }, 30_000);
});
