import { formatDateLong } from "@/lib/dates";
import { formatBaht, toSatang } from "@/lib/payment/money";
import { pdfText, pdfWords } from "@/features/certificates/lib/text";
import { bahtText } from "@/features/commerce/lib/baht-text";
import type { Seller } from "@/features/settings/schemas";

/**
 * M18 · FR-18.2 — ข้อมูลทุกตัวอักษรบนใบเสร็จรับเงิน (pure function)
 *
 * ตัว render (`receipt-pdf.tsx`) วาดเฉพาะค่าจากโมเดลนี้ · ทุกสตริงผ่าน `pdfText()`/`pdfWords()` (บั๊ก `ำ` ของ react-pdf)
 * ผู้ขาย/ผู้ซื้อมาจาก snapshot ใน `Order.billing` ที่บันทึกตอนออกใบ — แก้ข้อมูลผู้ขายหรือชื่อผู้ใช้ภายหลัง ใบเดิมไม่เปลี่ยน
 * Q2 ตั้งต้น: ใบเสร็จรับเงินอย่างเดียว ไม่แสดงภาษีมูลค่าเพิ่ม
 */

/** snapshot ใน `Order.billing` ตอนออกเลขใบเสร็จ */
export type ReceiptBilling = { seller: Seller; buyer: { name: string; email: string } };

export type ReceiptInput = {
  receiptNo: string;
  orderId: string;
  paidAt: Date;
  courseTitle: string;
  subtotal: string;
  discount: string;
  amount: string;
  couponCode: string | null;
  method: string | null;
  billing: ReceiptBilling;
};

type Words = string[];

export type ReceiptModel = {
  heading: string;
  labels: { buyer: string; item: string; amount: string };
  seller: { name: Words; lines: Words[] };
  meta: { label: string; value: string }[];
  buyer: { name: Words; email: string };
  item: { title: Words; amount: string };
  totals: { label: Words; value: string; strong?: boolean }[];
  amountText: string;
  footnote: Words;
};

const METHOD: Record<string, string> = { card: "บัตรเครดิต/เดบิต", promptpay: "PromptPay", coupon: "คูปองส่วนลด" };

/** แยกเป็นกล่องละคำ — ขึ้นบรรทัดใหม่ได้เฉพาะระหว่างคำ */
const words = (value: string): Words => pdfWords(value);

export function buildReceiptModel(input: ReceiptInput): ReceiptModel {
  const { seller, buyer } = input.billing;
  const hasDiscount = toSatang(input.discount) > 0;
  return {
    heading: pdfText("ใบเสร็จรับเงิน"),
    labels: { buyer: pdfText("ได้รับเงินจาก"), item: pdfText("รายการ"), amount: pdfText("จำนวนเงิน") },
    seller: {
      name: words(seller.name),
      lines: [
        seller.address ? words(seller.address) : null,
        seller.taxId ? words(`เลขประจำตัวผู้เสียภาษี ${seller.taxId}`) : null,
        seller.phone ? words(`โทร ${seller.phone}`) : null,
      ].filter((line): line is Words => line !== null),
    },
    meta: [
      { label: pdfText("เลขที่"), value: pdfText(input.receiptNo) },
      { label: pdfText("วันที่"), value: pdfText(formatDateLong(input.paidAt)) },
      { label: pdfText("คำสั่งซื้อ"), value: pdfText(input.orderId) },
      ...(input.method ? [{ label: pdfText("ชำระโดย"), value: pdfText(METHOD[input.method] ?? input.method) }] : []),
    ],
    buyer: { name: words(buyer.name), email: pdfText(buyer.email) },
    item: { title: words(`คอร์สออนไลน์: ${input.courseTitle}`), amount: pdfText(formatBaht(input.subtotal)) },
    totals: [
      ...(hasDiscount
        ? [
            { label: words("รวมเป็นเงิน"), value: pdfText(formatBaht(input.subtotal)) },
            {
              label: words(input.couponCode ? `ส่วนลด (คูปอง ${input.couponCode})` : "ส่วนลด"),
              value: pdfText(`−${formatBaht(input.discount)}`),
            },
          ]
        : []),
      { label: words("จำนวนเงินที่ชำระ"), value: pdfText(formatBaht(input.amount)), strong: true },
    ],
    amountText: pdfText(`(${bahtText(toSatang(input.amount))})`),
    footnote: words("เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์"),
  };
}
