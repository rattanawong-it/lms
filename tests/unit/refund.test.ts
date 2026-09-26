import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import { checkRefund } from "@/features/commerce/lib/refund-rules";
import { refundSchema } from "@/features/commerce/schemas";

const NOW = new Date("2026-09-26T05:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const paid = { status: OrderStatus.PAID, amount: "990.00", paidAt: daysAgo(1), providerRef: "mock_1" };

describe("checkRefund (Q6 · 7 วัน / 20%)", () => {
  it("ตามนโยบาย", () => {
    expect(checkRefund(paid, 0, NOW)).toEqual({ kind: "allowed" });
    expect(checkRefund({ ...paid, paidAt: daysAgo(7) }, 20, NOW)).toEqual({ kind: "allowed" });
  });

  it("นอกนโยบาย → ต้องยืนยัน พร้อมบอกเหตุผลทุกข้อ", () => {
    expect(checkRefund({ ...paid, paidAt: daysAgo(7.01) }, 0, NOW)).toEqual({ kind: "override", reasons: ["ชำระมาแล้วเกิน 7 วัน"] });
    expect(checkRefund(paid, 21, NOW)).toEqual({ kind: "override", reasons: ["เรียนไปแล้ว 21% (เกิน 20%)"] });
    expect(checkRefund({ ...paid, paidAt: daysAgo(30) }, 80, NOW)).toMatchObject({ kind: "override", reasons: { length: 2 } });
  });

  it("คืนไม่ได้เลย", () => {
    expect(checkRefund({ ...paid, status: OrderStatus.REFUNDED }, 0, NOW)).toEqual({ kind: "blocked", reason: "คืนเงินรายการนี้ไปแล้ว" });
    expect(checkRefund({ ...paid, status: OrderStatus.PENDING, paidAt: null }, 0, NOW)).toEqual({
      kind: "blocked",
      reason: "คืนเงินได้เฉพาะรายการที่ชำระแล้ว",
    });
    expect(checkRefund({ ...paid, amount: "0.00", providerRef: null }, 0, NOW)).toEqual({
      kind: "blocked",
      reason: "รายการนี้ไม่มียอดชำระ (ใช้คูปองเต็มจำนวน)",
    });
    expect(checkRefund({ ...paid, providerRef: null }, 0, NOW)).toEqual({ kind: "blocked", reason: "รายการนี้ไม่ได้ชำระผ่านผู้ให้บริการ" });
  });
});

describe("refundSchema (ข้อความไทย)", () => {
  const id = "cm0000000000000000000001";
  it("ต้องมีเหตุผล · ติ๊กยืนยัน = true", () => {
    expect(refundSchema.parse({ orderId: id, reason: " ผู้เรียนขอยกเลิก ", override: null })).toEqual({
      orderId: id,
      reason: "ผู้เรียนขอยกเลิก",
      override: false,
    });
    expect(refundSchema.parse({ orderId: id, reason: "ผู้เรียนขอยกเลิก", override: "true" }).override).toBe(true);
    expect(refundSchema.safeParse({ orderId: id, reason: "สั้น", override: null }).error?.issues[0]?.message).toBe(
      "เหตุผลต้องยาวอย่างน้อย 5 ตัวอักษร",
    );
  });
});
