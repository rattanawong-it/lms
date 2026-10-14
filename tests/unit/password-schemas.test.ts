import { describe, expect, it } from "vitest";
import { changePasswordSchema, setPasswordSchema } from "@/features/auth/schemas";

/** M01 · FR-01.9 — ค่าจาก FormData: checkbox ที่ไม่ติ๊กเป็น null ไม่ใช่ "false" */
describe("setPasswordSchema", () => {
  it("รับรหัสผ่านที่ตรงกัน และอ่าน checkbox เป็น boolean", () => {
    const ok = setPasswordSchema.parse({ password: "abcd1234", confirmPassword: "abcd1234", revokeOtherSessions: "on" });
    expect(ok.revokeOtherSessions).toBe(true);
    const off = setPasswordSchema.parse({ password: "abcd1234", confirmPassword: "abcd1234", revokeOtherSessions: null });
    expect(off.revokeOtherSessions).toBe(false);
  });

  it("ปฏิเสธรหัสสั้นกว่า 8 ตัว และยืนยันไม่ตรง — ข้อความไทยอยู่ใต้ช่องที่ผิด", () => {
    const short = setPasswordSchema.safeParse({ password: "abc", confirmPassword: "abc", revokeOtherSessions: null });
    expect(short.error?.issues[0]).toMatchObject({ path: ["password"], message: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" });
    const mismatch = setPasswordSchema.safeParse({ password: "abcd1234", confirmPassword: "abcd12345", revokeOtherSessions: null });
    expect(mismatch.error?.issues[0]).toMatchObject({ path: ["confirmPassword"], message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" });
  });
});

describe("changePasswordSchema", () => {
  const base = { currentPassword: "old-pass-1", password: "new-pass-1", confirmPassword: "new-pass-1", revokeOtherSessions: "on" };

  it("รับข้อมูลครบ", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("ต้องกรอกรหัสผ่านปัจจุบัน", () => {
    const r = changePasswordSchema.safeParse({ ...base, currentPassword: "" });
    expect(r.error?.issues[0]).toMatchObject({ path: ["currentPassword"], message: "กรุณากรอกรหัสผ่านปัจจุบัน" });
  });

  it("รหัสใหม่ต้องไม่ซ้ำรหัสเดิม", () => {
    const r = changePasswordSchema.safeParse({ ...base, currentPassword: "new-pass-1" });
    expect(r.error?.issues[0]).toMatchObject({ path: ["password"], message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน" });
  });
});
