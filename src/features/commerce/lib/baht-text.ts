/**
 * จำนวนเงินเป็นตัวอักษรภาษาไทยบนใบเสร็จ ("เก้าร้อยเก้าสิบบาทถ้วน") — ตามแบบ BAHTTEXT (pure · รับสตางค์)
 * หลักหน่วยเป็น 1 หลังหลักสิบขึ้นไปอ่าน "เอ็ด" (101 = หนึ่งร้อยเอ็ด) · หลักสิบ 2 อ่าน "ยี่สิบ" · หลักสิบ 1 อ่าน "สิบ"
 */

const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readGroup(n: number, afterMillion = false): string {
  const digits = String(n).split("").map(Number).reverse();
  let text = "";
  digits.forEach((d, place) => {
    if (d === 0) return;
    let word: string;
    if (place === 0) word = d === 1 && (n > 9 || afterMillion) ? "เอ็ด" : DIGIT[d]!;
    else if (place === 1) word = d === 1 ? "" : d === 2 ? "ยี่" : DIGIT[d]!;
    else word = DIGIT[d]!;
    text = word + PLACE[place] + text;
  });
  return text;
}

function readNumber(n: number): string {
  if (n < 1_000_000) return readGroup(n);
  return readNumber(Math.floor(n / 1_000_000)) + "ล้าน" + readGroup(n % 1_000_000, true);
}

export function bahtText(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0) throw new Error(`จำนวนสตางค์ไม่ถูกต้อง: ${satang}`);
  const baht = Math.floor(satang / 100);
  const rest = satang % 100;
  if (baht === 0 && rest === 0) return "ศูนย์บาทถ้วน";
  return (baht > 0 ? `${readNumber(baht)}บาท` : "") + (rest === 0 ? "ถ้วน" : `${readGroup(rest)}สตางค์`);
}
