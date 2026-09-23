import "server-only";
import ExcelJS from "exceljs";

/**
 * Excel (.xlsx) ↔ ตารางสตริง — ใช้ฝั่ง server เท่านั้น (CHANGELOG #20)
 * ให้ผลลัพธ์รูปเดียวกับ `parseCsv()` เพื่อให้ตัวตรวจข้อมูลของแต่ละฟีเจอร์มีชุดเดียว
 */

/** ข้อความของเซลล์หนึ่ง — รองรับ rich text, สูตร (เอาผลลัพธ์), ลิงก์ และวันที่ */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return value.result === undefined ? "" : String(value.result);
    if ("text" in value) return String(value.text);
  }
  return cell.text ?? "";
}

/** อ่าน worksheet แรกเป็นแถว × เซลล์ · ข้ามแถวที่ว่างทั้งแถว */
export async function readXlsxRows(data: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  const width = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c += 1) cells.push(cellText(row.getCell(c)));
    if (cells.some((v) => v.trim() !== "")) rows.push(cells);
  });
  return rows;
}

/** เขียนตารางเป็นไฟล์ .xlsx หนึ่ง sheet — แถวแรกเป็นหัวตาราง (ตัวหนา + ตรึงไว้) */
export async function toXlsx(
  sheetName: string,
  rows: readonly (readonly (string | number | null | undefined)[])[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  for (const row of rows) sheet.addRow(row.map((v) => (v === null || v === undefined ? "" : v)));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 24;
    column.alignment = { wrapText: true, vertical: "top" };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
