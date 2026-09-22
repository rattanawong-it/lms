import { describe, expect, it } from "vitest";
import {
  bulkEnrollSchema,
  endOfDayBangkok,
  parseEmailList,
} from "@/features/enrollment/schemas";

/** M06 · FR-06.2 — การรับอีเมลเป็นกลุ่มและวันหมดสิทธิ์เรียน */

describe("parseEmailList", () => {
  it("รับบรรทัดละอีเมล", () => {
    expect(parseEmailList("a@krirk.ac.th\nb@krirk.ac.th")).toEqual([
      "a@krirk.ac.th",
      "b@krirk.ac.th",
    ]);
  });

  it("ดึงอีเมลออกจากแถว CSV ที่มีคอลัมน์อื่นปนมา", () => {
    const raw = "name,email,role\nสมชาย เกริกไกร,somchai.k@krirk.ac.th,STUDENT";
    expect(parseEmailList(raw)).toEqual(["somchai.k@krirk.ac.th"]);
  });

  it("แปลงเป็นตัวพิมพ์เล็กและตัดตัวซ้ำ", () => {
    expect(parseEmailList("A@Krirk.ac.th; a@krirk.ac.th")).toEqual(["a@krirk.ac.th"]);
  });

  it("ข้อความที่ไม่มีอีเมลเลยคืนรายการว่าง", () => {
    expect(parseEmailList("ไม่มีอีเมลในบรรทัดนี้")).toEqual([]);
  });
});

describe("endOfDayBangkok", () => {
  it('"2026-09-30" หมายถึงสิ้นวันตามเวลาไทย ไม่ใช่เที่ยงคืน UTC', () => {
    // 30 ก.ย. 2569 23:59:59.999 (+07:00) = 30 ก.ย. 16:59:59.999Z
    expect(endOfDayBangkok("2026-09-30").toISOString()).toBe("2026-09-30T16:59:59.999Z");
  });
});

describe("bulkEnrollSchema", () => {
  const courseId = "clz0000000000000000000000";

  it("ข้อความที่ไม่มีอีเมลถูกปฏิเสธพร้อมข้อความภาษาไทย", () => {
    const result = bulkEnrollSchema.safeParse({
      courseId,
      emails: "ไม่มีอีเมล",
      expiresAt: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("ไม่พบอีเมลที่ใช้ได้ในข้อความที่กรอก");
  });

  it("ช่องวันหมดสิทธิ์ที่เว้นว่างกลายเป็น null", () => {
    const result = bulkEnrollSchema.safeParse({
      courseId,
      emails: "a@krirk.ac.th",
      expiresAt: "",
    });
    expect(result.success).toBe(true);
    expect(result.data?.expiresAt).toBeNull();
    expect(result.data?.emails).toEqual(["a@krirk.ac.th"]);
  });
});
