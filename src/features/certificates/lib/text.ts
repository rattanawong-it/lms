/**
 * M10 — ข้อความภาษาไทยก่อนเข้า PDF (pure function — unit test ได้)
 *
 * **ทุกข้อความที่เข้า PDF ต้องผ่าน `pdfText()`** (phase-2-plan ขั้น 0)
 * `@react-pdf/renderer` 4.9 + fontkit แตก `ำ` (U+0E33) เป็นสอง glyph (ํ + า) แต่ตัดความยาวตามจำนวนตัวอักษรเดิม
 * ทำให้ตัวอักษรตัวสุดท้ายของข้อความหาย ("ปิ่นทองคำ" → "ปิ่นทองคํ") — แตกเป็น `ํา` ไว้ก่อนแก้ได้และหน้าตาเหมือนเดิม
 * ข้อแลก: ข้อความที่คัดลอกจากไฟล์ PDF เป็น "ํา" (หน้า /verify/[code] ยังแสดงข้อความจริง)
 */

const SARA_AM = "ำ";
const NIKHAHIT_SARA_AA = "ํา";

export function pdfText(value: string): string {
  return value.normalize("NFC").replaceAll(SARA_AM, NIKHAHIT_SARA_AA);
}

/**
 * ตัดข้อความเป็นคำ (Intl.Segmenter) — PDF วางแต่ละคำเป็นกล่องใน flex-wrap เพื่อขึ้นบรรทัดใหม่ระหว่างคำ
 * ตัวตัดบรรทัดของ react-pdf ต้องการช่องว่าง และถ้าให้จุดตัดผ่าน hyphenation จะเติม "-" ทุกครั้งที่ตัด (ผิดสำหรับภาษาไทย)
 * ตัดคำก่อนแปลง `ำ` เพราะตัวตัดคำรู้จักรูปปกติ แล้วค่อยแปลงทีละคำ
 */
export function pdfWords(value: string): string[] {
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return [...segmenter.segment(value.normalize("NFC"))].map((s) => pdfText(s.segment));
}

export type TemplateVars = {
  /** ชื่อผู้ได้รับ */
  name: string;
  /** ชื่อคอร์ส */
  course: string;
  /** วันที่ออก (ข้อความภาษาไทยพร้อมแสดง) */
  date: string;
  /** รหัสใบประกาศ */
  code: string;
};

/** ตัวแปรที่ใช้ในแม่แบบได้ (FR-10.2) */
export const TEMPLATE_VARIABLES = {
  "{ชื่อ}": "name",
  "{คอร์ส}": "course",
  "{วันที่}": "date",
  "{รหัส}": "code",
} as const satisfies Record<string, keyof TemplateVars>;

/** ชิ้นส่วนของบรรทัด: ข้อความธรรมดา (`variable = null`) หรือค่าของตัวแปรตัวไหน */
export type LinePart = { text: string; variable: keyof TemplateVars | null };

/** ตัวแปรที่ห้ามตัดขึ้นบรรทัดใหม่กลางคำ — ชื่อคนและรหัส ("ปิ่น / ทองคำ" อ่านผิด) */
export const UNBREAKABLE_VARS: ReadonlySet<keyof TemplateVars> = new Set(["name", "code"]);

/** ใส่ค่าตัวแปรลงหนึ่งบรรทัด — ข้อความที่ไม่ใช่ตัวแปรที่รู้จักคงไว้ตามเดิม */
export function fillLine(line: string, vars: TemplateVars): LinePart[] {
  const pattern = new RegExp(`(${Object.keys(TEMPLATE_VARIABLES).join("|")})`, "g");
  return line
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => {
      const key = part in TEMPLATE_VARIABLES ? TEMPLATE_VARIABLES[part as keyof typeof TEMPLATE_VARIABLES] : null;
      return key ? { text: vars[key], variable: key } : { text: part, variable: null };
    });
}

/** ข้อความหลังใส่ตัวแปร (ใช้กับตัวอย่างในหน้าจอ — ไม่ใช่ใน PDF) */
export function fillText(body: string, vars: TemplateVars): string {
  return body
    .split("\n")
    .map((line) => fillLine(line, vars).map((p) => p.text).join(""))
    .join("\n");
}
