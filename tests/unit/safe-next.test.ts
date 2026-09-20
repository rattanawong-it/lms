import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/auth/lib/safe-next";

describe("safeNext (NFR-03 กัน open redirect)", () => {
  it("ยอมรับ path ภายในระบบ", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/admin/users?page=2")).toBe("/admin/users?page=2");
  });

  it("ปฏิเสธ URL ภายนอกและ protocol-relative", () => {
    expect(safeNext("https://evil.example")).toBeUndefined();
    expect(safeNext("//evil.example")).toBeUndefined();
    expect(safeNext("/" + "\\" + "evil.example")).toBeUndefined();
  });

  it("ปฏิเสธค่าว่างและค่าที่ไม่ใช่ string", () => {
    expect(safeNext("")).toBeUndefined();
    expect(safeNext(undefined)).toBeUndefined();
    expect(safeNext(null)).toBeUndefined();
    expect(safeNext(42)).toBeUndefined();
  });
});
