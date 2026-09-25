import { describe, expect, it } from "vitest";
import { REDACTED, SCRUBBED, auditDiff, redactSecrets, scrubStrings } from "@/features/audit/lib/json";
import { auditQuery, parseAuditFilter } from "@/features/audit/schemas";
import { DEFAULT_BRANDING, brandingSchema, parseBranding } from "@/features/settings/schemas";
import {
  deletedEmail,
  deletionRejectSchema,
  deletionRequestSchema,
} from "@/features/privacy/schemas";

describe("redactSecrets (FR-17.1 ไม่เก็บรหัสผ่าน/โทเค็นใน audit)", () => {
  it("ซ่อนฟิลด์ลับทุกชั้น รวมใน array", () => {
    const out = redactSecrets({
      email: "a@krirk.ac.th",
      password: "hunter22",
      nested: { accessToken: "x", refresh_token: "y", apiKey: "k", clientSecret: "s" },
      list: [{ newPassword: "p" }, "text"],
    });
    expect(out).toEqual({
      email: "a@krirk.ac.th",
      password: REDACTED,
      nested: { accessToken: REDACTED, refresh_token: REDACTED, apiKey: REDACTED, clientSecret: REDACTED },
      list: [{ newPassword: REDACTED }, "text"],
    });
  });

  it("ไม่แตะฟิลด์ที่แค่ชื่อคล้าย เช่น code ของใบประกาศ", () => {
    expect(redactSecrets({ code: "LMS-2026-ABC123", passed: true })).toEqual({ code: "LMS-2026-ABC123", passed: true });
  });

  it("ค่าที่ไม่ใช่ object ผ่านไปตรง ๆ", () => {
    expect(redactSecrets("x")).toBe("x");
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets([1, 2])).toEqual([1, 2]);
  });
});

describe("scrubStrings (FR-17.4 anonymize ใน AuditLog)", () => {
  it("แทนเฉพาะส่วนที่ตรง ไม่สนตัวพิมพ์ ทุกชั้น", () => {
    const out = scrubStrings(
      { email: "Somchai@Krirk.ac.th", note: "เพิ่ม somchai@krirk.ac.th เป็นผู้สอนร่วม", n: 3, list: ["สมชาย ใจดี"] },
      ["somchai@krirk.ac.th", "สมชาย ใจดี"],
    );
    expect(out).toEqual({ email: SCRUBBED, note: `เพิ่ม ${SCRUBBED} เป็นผู้สอนร่วม`, n: 3, list: [SCRUBBED] });
  });

  it("คำยาวก่อน — ชื่อที่อยู่ในอีเมลไม่ทำให้อีเมลเหลือครึ่งเดียว", () => {
    expect(scrubStrings("somchai@krirk.ac.th", ["somchai", "somchai@krirk.ac.th"])).toBe(SCRUBBED);
  });

  it("ข้ามคำสั้นกว่า 3 ตัวอักษร และอักขระพิเศษของ regex ไม่พัง", () => {
    expect(scrubStrings("ab และ a+b(c)", ["ab", "a+b(c)"])).toBe(`ab และ ${SCRUBBED}`);
    expect(scrubStrings({ x: "เดิม" }, [])).toEqual({ x: "เดิม" });
  });
});

describe("auditDiff (FR-17.2 ดู diff ก่อน/หลัง)", () => {
  it("รวม key ของทั้งสองฝั่ง และบอกว่าเปลี่ยนหรือไม่", () => {
    expect(auditDiff({ role: "STUDENT", departmentId: "d1" }, { role: "INSTRUCTOR", departmentId: "d1" })).toEqual([
      { key: "role", before: "STUDENT", after: "INSTRUCTOR", changed: true },
      { key: "departmentId", before: "d1", after: "d1", changed: false },
    ]);
  });

  it("สร้างใหม่ (ไม่มี before) / ลบ (ไม่มี after)", () => {
    expect(auditDiff(null, { title: "ก" })).toEqual([{ key: "title", before: null, after: "ก", changed: true }]);
    expect(auditDiff({ title: "ก" }, null)).toEqual([{ key: "title", before: "ก", after: null, changed: true }]);
    expect(auditDiff(null, null)).toEqual([]);
  });

  it("ค่าซ้อนแสดงเป็น JSON · ค่าที่ไม่ใช่ object แสดงแถวเดียว", () => {
    expect(auditDiff({ grades: [{ g: "A" }] }, { grades: [{ g: "B" }] })[0]).toMatchObject({
      before: '[{"g":"A"}]',
      after: '[{"g":"B"}]',
      changed: true,
    });
    expect(auditDiff([1], [2])).toEqual([{ key: "ค่า", before: "[1]", after: "[2]", changed: true }]);
  });
});

describe("parseAuditFilter", () => {
  it("ตัดอักขระแปลกออกจาก action/entity และตรวจวันที่", () => {
    const f = parseAuditFilter({ action: "user.role'; drop", entity: "User", from: "2026-09-01", to: "bad", page: "0" });
    expect(f).toMatchObject({ action: "user.roledrop", entity: "User", from: "2026-09-01", to: null, page: 1 });
    expect(auditQuery(f)).toEqual({ action: "user.roledrop", entity: "User", from: "2026-09-01" });
  });
});

describe("branding (FR-17.3)", () => {
  it("ค่าใน DB ผิดรูปแบบถอยไปค่าตั้งต้น", () => {
    expect(parseBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(parseBranding({ name: "" })).toEqual(DEFAULT_BRANDING);
    expect(parseBranding({ name: "ระบบเรียนเกริก", logoAssetId: null })).toEqual({ name: "ระบบเรียนเกริก", logoAssetId: null });
  });

  it("ชื่อต้อง 2–40 ตัวอักษร · โลโก้ว่าง = ไม่มี", () => {
    expect(brandingSchema.safeParse({ name: "ก" }).success).toBe(false);
    expect(brandingSchema.safeParse({ name: "x".repeat(41) }).success).toBe(false);
    expect(brandingSchema.parse({ name: " KRIRK ", logoAssetId: "" })).toEqual({ name: "KRIRK", logoAssetId: null });
  });
});

describe("คำขอลบบัญชี (FR-17.4)", () => {
  it("ต้องยืนยันตัวตน · เหตุผลไม่บังคับ", () => {
    expect(deletionRequestSchema.safeParse({ confirm: "" }).success).toBe(false);
    expect(deletionRequestSchema.parse({ confirm: "pw", reason: "" })).toEqual({ confirm: "pw", reason: null });
    expect(deletionRequestSchema.parse({ confirm: "pw", reason: null })).toEqual({ confirm: "pw", reason: null });
  });

  it("ปฏิเสธต้องมีเหตุผล", () => {
    expect(deletionRejectSchema.safeParse({ userId: "cmfxxxxxxxxxxxxxxxxxxxxxx", reason: " " }).success).toBe(false);
  });

  it("อีเมลแทนเป็นโดเมน .invalid ที่ไม่ซ้ำต่อผู้ใช้", () => {
    expect(deletedEmail("abc")).toBe("deleted-abc@deleted.invalid");
  });
});
