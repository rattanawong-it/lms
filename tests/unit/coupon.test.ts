import { describe, expect, it } from "vitest";
import { discountSatang, normalizeCouponCode, quoteCoupon, type CouponRule } from "@/features/commerce/lib/coupon";
import { checkoutSchema, couponFormSchema } from "@/features/commerce/schemas";

const NOW = new Date("2026-09-26T05:00:00Z");
const COURSE = "cm0000000000000000000001";
const base: CouponRule = {
  percentOff: 20,
  amountOff: null,
  maxUses: null,
  usedCount: 0,
  validFrom: null,
  validUntil: null,
  active: true,
  courseId: null,
};
const quote = (rule: Partial<CouponRule> | null, subtotal = "990.00", reserved = 0) =>
  quoteCoupon(rule && { ...base, ...rule }, { courseId: COURSE, subtotal, now: NOW, reserved });

describe("discountSatang (คิดเป็นสตางค์ · ปัดครึ่งขึ้น)", () => {
  it("เปอร์เซ็นต์", () => {
    expect(discountSatang({ percentOff: 20, amountOff: null }, 99000)).toBe(19800);
    // 15% ของ 333.33 = 49.9995 → 50.00
    expect(discountSatang({ percentOff: 15, amountOff: null }, 33333)).toBe(5000);
    // 10% ของ 0.05 = 0.005 → 0.01
    expect(discountSatang({ percentOff: 10, amountOff: null }, 5)).toBe(1);
    expect(discountSatang({ percentOff: 100, amountOff: null }, 99000)).toBe(99000);
  });

  it("จำนวนเงิน — ไม่เกินยอดก่อนลด (ยอดหลังลดต่ำสุด 0)", () => {
    expect(discountSatang({ percentOff: null, amountOff: "100.50" }, 99000)).toBe(10050);
    expect(discountSatang({ percentOff: null, amountOff: "1500.00" }, 99000)).toBe(99000);
  });
});

describe("quoteCoupon (ข้อความไทย)", () => {
  it("คิดยอดหลังลดเป็นสตริงบาท 2 ตำแหน่ง", () => {
    expect(quote({})).toEqual({ ok: true, subtotal: "990.00", discount: "198.00", amount: "792.00" });
    expect(quote({ percentOff: null, amountOff: "1000" })).toEqual({ ok: true, subtotal: "990.00", discount: "990.00", amount: "0.00" });
  });

  it("ไม่มี/ปิดใช้", () => {
    expect(quote(null)).toEqual({ ok: false, message: "ไม่พบรหัสคูปองนี้ หรือคูปองถูกปิดใช้แล้ว" });
    expect(quote({ active: false })).toMatchObject({ ok: false, message: "ไม่พบรหัสคูปองนี้ หรือคูปองถูกปิดใช้แล้ว" });
  });

  it("คอร์สไม่ตรง", () => {
    expect(quote({ courseId: "cm0000000000000000000002" })).toMatchObject({ ok: false, message: "คูปองนี้ใช้กับคอร์สนี้ไม่ได้" });
    expect(quote({ courseId: COURSE }).ok).toBe(true);
  });

  it("ช่วงเวลา", () => {
    expect(quote({ validFrom: new Date("2026-09-27T00:00:00Z") })).toMatchObject({ message: "คูปองนี้ยังไม่ถึงวันเริ่มใช้" });
    expect(quote({ validUntil: new Date("2026-09-26T04:59:59Z") })).toMatchObject({ message: "คูปองนี้หมดอายุแล้ว" });
    expect(quote({ validFrom: new Date("2026-09-01T00:00:00Z"), validUntil: new Date("2026-09-30T00:00:00Z") }).ok).toBe(true);
  });

  it("นับสิทธิ์ที่ใช้แล้ว + ที่จองไว้ในคำสั่งซื้อรอชำระ (Q7)", () => {
    expect(quote({ maxUses: 5, usedCount: 4 }).ok).toBe(true);
    expect(quote({ maxUses: 5, usedCount: 5 })).toMatchObject({ message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" });
    expect(quote({ maxUses: 5, usedCount: 4 }, "990.00", 1)).toMatchObject({ message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" });
  });
});

describe("รหัสคูปอง", () => {
  it("ไม่สนตัวพิมพ์ · ตัดช่องว่าง", () => {
    expect(normalizeCouponCode("  welcome20 ")).toBe("WELCOME20");
    expect(normalizeCouponCode(null)).toBe("");
  });

  it("checkout — ว่าง = ไม่ใช้คูปอง · รูปแบบผิดถูกปฏิเสธ", () => {
    expect(checkoutSchema.parse({ courseId: COURSE, couponCode: null }).couponCode).toBe("");
    expect(checkoutSchema.parse({ courseId: COURSE, couponCode: "save-10" }).couponCode).toBe("SAVE-10");
    const bad = checkoutSchema.safeParse({ courseId: COURSE, couponCode: "ลดราคา" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("รหัสคูปองไม่ถูกต้อง");
  });
});

describe("couponFormSchema (ฟอร์มผู้ดูแล)", () => {
  const form = (over: Record<string, string | null>) =>
    couponFormSchema.safeParse({
      code: "new10",
      kind: "percent",
      value: "10",
      maxUses: "",
      validFrom: "",
      validUntil: "",
      courseId: "",
      ...over,
    });

  it("เปอร์เซ็นต์ 1–100 จำนวนเต็ม", () => {
    expect(form({}).data).toEqual({
      code: "NEW10",
      percentOff: 10,
      amountOff: null,
      maxUses: null,
      validFrom: null,
      validUntil: null,
      courseId: null,
    });
    expect(form({ value: "0" }).error?.issues[0]?.message).toBe("เปอร์เซ็นต์ต้องเป็นจำนวนเต็ม 1–100");
    expect(form({ value: "12.5" }).success).toBe(false);
    expect(form({ value: "101" }).success).toBe(false);
  });

  it("จำนวนเงินเก็บเป็นบาท 2 ตำแหน่ง", () => {
    expect(form({ kind: "amount", value: "1,000.5" }).data?.amountOff).toBe("1000.50");
    expect(form({ kind: "amount", value: "0.50" }).error?.issues[0]?.message).toBe("ส่วนลดต้องอยู่ระหว่าง 1–100,000 บาท");
    expect(form({ kind: "amount", value: "abc" }).error?.issues[0]?.message).toBe("ส่วนลดต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง");
  });

  it("รหัส · จำนวนครั้ง · ช่วงวันที่ (เวลาไทย)", () => {
    expect(form({ code: "ab" }).error?.issues[0]?.path).toEqual(["code"]);
    expect(form({ maxUses: "0" }).error?.issues[0]?.message).toBe("จำนวนครั้งต้องเป็นจำนวนเต็ม 1 ขึ้นไป");
    expect(form({ maxUses: "50" }).data?.maxUses).toBe(50);
    expect(form({ validFrom: "2026-10-01T00:00" }).data?.validFrom).toEqual(new Date("2026-09-30T17:00:00Z"));
    expect(form({ validFrom: "2026-10-02T00:00", validUntil: "2026-10-01T00:00" }).error?.issues[0]?.message).toBe(
      "วันหมดอายุต้องหลังวันเริ่มใช้",
    );
  });
});
