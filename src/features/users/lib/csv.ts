/**
 * FR-02.5 — ตัวอ่าน CSV ขนาดเล็กสำหรับนำเข้าผู้ใช้
 * รองรับเครื่องหมายคำพูด "..." และ escape ด้วย "" ตาม RFC 4180
 */
export type ParsedCsvRow = {
  line: number;
  values: Record<string, string>;
};

export type ImportPreviewRow = ParsedCsvRow & {
  status: "ok" | "skip" | "error";
  error?: string;
};

/** ชื่อคอลัมน์ที่ยอมรับ (ไทย/อังกฤษ) → ชื่อฟิลด์ภายใน */
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  "ชื่อ": "name",
  "ชื่อ-นามสกุล": "name",
  fullname: "name",
  email: "email",
  "อีเมล": "email",
  role: "role",
  "บทบาท": "role",
  department: "departmentCode",
  departmentcode: "departmentCode",
  dept: "departmentCode",
  "คณะ": "departmentCode",
  externalid: "externalId",
  studentid: "externalId",
  "รหัสนักศึกษา": "externalId",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === "," || char === ";") {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

export function parseUserCsv(raw: string): ParsedCsvRow[] {
  const lines = raw
    .replace(/^﻿/, "") // ตัด BOM จาก Excel
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) => {
    const key = h.toLowerCase().replace(/\s|_/g, "");
    return HEADER_ALIASES[key] ?? HEADER_ALIASES[h.trim()] ?? key;
  });

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = cells[index] ?? "";
      if (value !== "") values[header] = value;
    });
    rows.push({ line: i + 1, values });
  }
  return rows;
}

/** ไฟล์ตัวอย่างให้ผู้ดูแลดาวน์โหลด */
export const SAMPLE_CSV = `name,email,role,department,externalId
สมชาย เกริกไกร,somchai.k@krirk.ac.th,STUDENT,BUS,6512345678
มาลี ใจดี,malee.j@krirk.ac.th,INSTRUCTOR,BUS,EMP00123
`;
