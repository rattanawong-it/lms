import { describe, expect, it } from "vitest";
import { avatarAssetId, avatarUrl } from "@/features/account/lib/avatar";
import { centerSquare } from "@/features/account/lib/resize-avatar";
import { avatarSchema } from "@/features/auth/schemas";
import { presignInputSchema } from "@/features/uploads/schemas";

const id = "cmg1a2b3c4d5e6f7g8h9i0jkl";

describe("avatarAssetId — แยกรูปที่ระบบเป็นเจ้าของออกจาก URL ภายนอก", () => {
  it("อ่าน id จาก /api/media/<id> ที่ setAvatar ตั้งไว้", () => {
    expect(avatarAssetId(avatarUrl(id))).toBe(id);
  });

  it("รูปจาก Google และค่าว่างไม่ใช่ของระบบ", () => {
    expect(avatarAssetId("https://lh3.googleusercontent.com/a/abc=s96-c")).toBeNull();
    expect(avatarAssetId(null)).toBeNull();
    expect(avatarAssetId(undefined)).toBeNull();
    expect(avatarAssetId("")).toBeNull();
  });

  it("ไม่ยอมรับ path แปลก ๆ ที่อาจชี้ไปที่อื่น", () => {
    expect(avatarAssetId(`/api/media/${id}/../x`)).toBeNull();
    expect(avatarAssetId(`/api/media/${id}?x=1`)).toBeNull();
    expect(avatarAssetId("/api/media/")).toBeNull();
    expect(avatarAssetId(`https://evil.example/api/media/${id}`)).toBeNull();
  });
});

describe("centerSquare — ครอปกึ่งกลางอัตโนมัติ", () => {
  it("รูปแนวนอนตัดซ้ายขวาเท่ากัน", () => {
    expect(centerSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
  });
  it("รูปแนวตั้งตัดบนล่างเท่ากัน", () => {
    expect(centerSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
  });
  it("รูปจัตุรัสไม่ตัด", () => {
    expect(centerSquare(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });
});

describe("schemas", () => {
  it("setAvatar รับเฉพาะ cuid", () => {
    expect(avatarSchema.safeParse({ assetId: id }).success).toBe(true);
    expect(avatarSchema.safeParse({ assetId: "../etc" }).success).toBe(false);
  });

  it("presign รับ purpose เฉพาะ avatar", () => {
    const base = { kind: "IMAGE", mime: "image/webp", size: 1000, originalName: "avatar.webp" };
    expect(presignInputSchema.safeParse({ ...base, purpose: "avatar" }).success).toBe(true);
    expect(presignInputSchema.safeParse({ ...base, purpose: "cover" }).success).toBe(false);
  });
});
