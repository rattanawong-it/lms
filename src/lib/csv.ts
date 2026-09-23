/**
 * CSV ตาม RFC 4180 — อ่าน/เขียนเป็นตารางสตริง ใช้ร่วมกันระหว่างนำเข้าข้อสอบ (FR-07.7)
 * และส่งออกสมุดคะแนน (FR-09.5)
 *
 * ต่างจากตัวอ่านใน `features/users/lib/csv.ts` ตรงที่รองรับ**การขึ้นบรรทัดใหม่ในเซลล์**
 * ที่อยู่ในเครื่องหมายคำพูด — โจทย์ข้อสอบมีหลายบรรทัดได้ ถ้าตัดตามบรรทัดตรง ๆ แถวจะขาดกลางคัน
 *
 * pure function — client และ unit test เรียกได้
 */

const BOM = "﻿";

/** อ่าน CSV เป็นแถว × เซลล์ (ตัด BOM, รองรับ CRLF/LF, ข้ามแถวที่ว่างทั้งแถว) */
export function parseCsv(raw: string): string[][] {
  const text = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") inQuotes = true;
    else if (char === ",") endCell();
    else if (char === "\n") endRow();
    else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

/**
 * เขียนตารางเป็น CSV — ใส่ BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกโดยไม่ต้องเลือก encoding
 * และขึ้นบรรทัดด้วย CRLF ตามมาตรฐาน
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return (
    BOM +
    rows.map((r) => r.map((v) => quote(v === null || v === undefined ? "" : String(v))).join(",")).join("\r\n") +
    "\r\n"
  );
}
