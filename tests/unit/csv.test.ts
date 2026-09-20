import { describe, expect, it } from "vitest";
import { parseUserCsv, SAMPLE_CSV } from "@/features/users/lib/csv";

describe("parseUserCsv (FR-02.5)", () => {
  it("อ่านไฟล์ตัวอย่างได้ครบทุกแถว", () => {
    const rows = parseUserCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.values).toMatchObject({
      name: "สมชาย เกริกไกร",
      email: "somchai.k@krirk.ac.th",
      role: "STUDENT",
      departmentCode: "BUS",
      externalId: "6512345678",
    });
  });

  it("รองรับหัวคอลัมน์ภาษาไทย", () => {
    const rows = parseUserCsv("ชื่อ,อีเมล,บทบาท\nมาลี ใจดี,malee@krirk.ac.th,INSTRUCTOR");
    expect(rows[0]!.values).toMatchObject({
      name: "มาลี ใจดี",
      email: "malee@krirk.ac.th",
      role: "INSTRUCTOR",
    });
  });

  it("รองรับเครื่องหมายคำพูดและ escape ตาม RFC 4180", () => {
    const rows = parseUserCsv('name,email\n"ใจดี, มาลี","malee@krirk.ac.th"');
    expect(rows[0]!.values.name).toBe("ใจดี, มาลี");
  });

  it("ตัด BOM จาก Excel และข้ามบรรทัดว่าง", () => {
    const rows = parseUserCsv("﻿name,email\n\nsomchai,somchai@krirk.ac.th\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.name).toBe("somchai");
  });

  it("นับเลขบรรทัดตามไฟล์จริงเพื่อใช้รายงานข้อผิดพลาด", () => {
    const rows = parseUserCsv("name,email\na,a@krirk.ac.th\nb,b@krirk.ac.th");
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("คืนค่าว่างเมื่อมีแต่หัวตาราง", () => {
    expect(parseUserCsv("name,email")).toEqual([]);
  });
});
