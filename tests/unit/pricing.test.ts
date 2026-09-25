import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollPolicy, Visibility } from "@/generated/prisma/enums";
import { canEditPrice, courseOffer, isPaidCourse, parsePriceInput } from "@/features/commerce/lib/pricing";

describe("isPaidCourse (Q4 ขายเฉพาะ PUBLIC)", () => {
  it("ต้องเป็นคอร์สสาธารณะและราคา > 0", () => {
    expect(isPaidCourse({ visibility: Visibility.PUBLIC, price: "990.00" })).toBe(true);
    expect(isPaidCourse({ visibility: Visibility.PUBLIC, price: "0.00" })).toBe(false);
    expect(isPaidCourse({ visibility: Visibility.PUBLIC, price: null })).toBe(false);
    // ราคาค้างใน DB ของคอร์สภายในไม่ทำให้นักศึกษาต้องจ่าย
    expect(isPaidCourse({ visibility: Visibility.INTERNAL, price: "990.00" })).toBe(false);
  });
});

describe("canEditPrice (Q3 ราคามีผลเมื่อผู้ดูแลอนุมัติ)", () => {
  it("ผู้สอนแก้ได้เฉพาะคอร์สร่าง · ผู้ดูแลแก้ได้เสมอ", () => {
    expect(canEditPrice(CourseStatus.DRAFT, false)).toBe(true);
    expect(canEditPrice(CourseStatus.PENDING_REVIEW, false)).toBe(false);
    expect(canEditPrice(CourseStatus.PUBLISHED, false)).toBe(false);
    expect(canEditPrice(CourseStatus.PUBLISHED, true)).toBe(true);
  });
});

describe("parsePriceInput (ข้อความไทย)", () => {
  it("ว่าง/0 = ฟรี · ตัดจุลภาค · เก็บ 2 ตำแหน่ง", () => {
    expect(parsePriceInput("", Visibility.PUBLIC)).toEqual({ ok: true, price: null });
    expect(parsePriceInput("0", Visibility.INTERNAL)).toEqual({ ok: true, price: null });
    expect(parsePriceInput(" 1,290.5 ", Visibility.PUBLIC)).toEqual({ ok: true, price: "1290.50" });
    expect(parsePriceInput(null, Visibility.PUBLIC)).toEqual({ ok: true, price: null });
  });

  it("ปฏิเสธค่าผิดรูปแบบ ต่ำ/สูงเกิน และราคาของคอร์สภายใน", () => {
    expect(parsePriceInput("abc", Visibility.PUBLIC)).toEqual({ ok: false, message: "ราคาต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง" });
    expect(parsePriceInput("-5", Visibility.PUBLIC).ok).toBe(false);
    expect(parsePriceInput("9.999", Visibility.PUBLIC).ok).toBe(false);
    expect(parsePriceInput("0.50", Visibility.PUBLIC)).toEqual({ ok: false, message: "ราคาต่ำสุด 1 บาท (หรือเว้นว่างเพื่อเปิดฟรี)" });
    expect(parsePriceInput("100000.01", Visibility.PUBLIC)).toEqual({ ok: false, message: "ราคาสูงสุด 100,000 บาท" });
    expect(parsePriceInput("990", Visibility.INTERNAL)).toEqual({ ok: false, message: "ตั้งราคาได้เฉพาะคอร์สสาธารณะ" });
  });
});

describe("courseOffer — แผงข้างหน้าคอร์ส", () => {
  const paid = { visibility: Visibility.PUBLIC, price: "990.00", enrollPolicy: EnrollPolicy.OPEN };

  it("ฟรี / ซื้อได้", () => {
    expect(courseOffer({ ...paid, price: null }, true)).toEqual({ kind: "free" });
    expect(courseOffer(paid, true)).toEqual({ kind: "buy", price: "990.00" });
  });

  it("ยังไม่ต่อ gateway หรือคอร์สไม่ได้รับสมัครทั่วไป → ยังซื้อไม่ได้", () => {
    expect(courseOffer(paid, false)).toMatchObject({ kind: "not-for-sale", reason: expect.stringContaining("ยังไม่เปิดขาย") });
    expect(courseOffer({ ...paid, enrollPolicy: EnrollPolicy.INVITE_ONLY }, true)).toMatchObject({ kind: "not-for-sale" });
    expect(courseOffer({ ...paid, enrollPolicy: EnrollPolicy.APPROVAL }, true)).toMatchObject({ kind: "not-for-sale" });
  });
});
