import { CourseStatus, EnrollPolicy, Visibility } from "@/generated/prisma/enums";
import { fromSatang, toSatang } from "@/lib/payment/money";

/**
 * M18 · FR-18.1 — กติการาคาคอร์ส (pure · ใช้ทั้งหน้าจอ, action และ unit test)
 * Q4 ขายเฉพาะคอร์ส PUBLIC · Q3 ผู้สอนตั้งราคาได้ระหว่างร่าง มีผลเมื่อผู้ดูแลอนุมัติ — หลังส่งตรวจเปลี่ยนได้เฉพาะผู้ดูแล
 */

type DecimalLike = { toString(): string };

/** ราคาสูงสุดที่รับ — กันพิมพ์ศูนย์เกิน (100,000 บาท) */
export const MAX_PRICE_SATANG = 100_000_00;

/** คอร์สนี้ต้องซื้อก่อนเรียนไหม — ราคา > 0 และเป็นคอร์สสาธารณะ (INTERNAL ฟรีเสมอแม้มีค่าค้างใน DB) */
export function isPaidCourse(course: { visibility: Visibility; price: DecimalLike | string | null }): boolean {
  return course.visibility === Visibility.PUBLIC && course.price !== null && toSatang(course.price) > 0;
}

/** ผู้แก้ราคาได้ — ผู้ดูแลเสมอ · ผู้สอนเฉพาะคอร์สร่าง (หลังส่งตรวจ ราคาที่ผู้ดูแลเห็นตอนอนุมัติต้องไม่เปลี่ยนเอง) */
export function canEditPrice(status: CourseStatus, isManager: boolean): boolean {
  return isManager || status === CourseStatus.DRAFT;
}

/**
 * ตรวจช่องราคาจากฟอร์ม (ข้อความภาษาไทย) · ว่าง/0 = ฟรี (null)
 * คืนราคาเป็นสตริงบาท 2 ตำแหน่งสำหรับ Decimal
 */
export function parsePriceInput(
  raw: unknown,
  visibility: Visibility,
): { ok: true; price: string | null } | { ok: false; message: string } {
  const text = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
  if (text === "") return { ok: true, price: null };
  let satang: number;
  try {
    satang = toSatang(text);
  } catch {
    return { ok: false, message: "ราคาต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  }
  if (satang === 0) return { ok: true, price: null };
  if (visibility !== Visibility.PUBLIC) return { ok: false, message: "ตั้งราคาได้เฉพาะคอร์สสาธารณะ" };
  if (satang < 100) return { ok: false, message: "ราคาต่ำสุด 1 บาท (หรือเว้นว่างเพื่อเปิดฟรี)" };
  if (satang > MAX_PRICE_SATANG) return { ok: false, message: "ราคาสูงสุด 100,000 บาท" };
  return { ok: true, price: fromSatang(satang) };
}

export type CourseOffer =
  /** ฟรี — ใช้แผงลงทะเบียนเดิม */
  | { kind: "free" }
  /** ซื้อได้ */
  | { kind: "buy"; price: string }
  /** มีราคาแต่ยังซื้อไม่ได้ — ระบบยังไม่ต่อ gateway หรือคอร์สไม่ได้เปิดรับทั่วไป */
  | { kind: "not-for-sale"; price: string; reason: string };

/** แผงข้างหน้าคอร์สแสดงอะไร · การซื้อใช้ได้เฉพาะคอร์สที่รับสมัครแบบ OPEN (ขออนุมัติ/เชิญเท่านั้น ให้ผู้ดูแลเพิ่มให้) */
export function courseOffer(
  course: { visibility: Visibility; price: DecimalLike | string | null; enrollPolicy: EnrollPolicy },
  paymentEnabled: boolean,
): CourseOffer {
  if (!isPaidCourse(course)) return { kind: "free" };
  const price = course.price!.toString();
  if (course.enrollPolicy !== EnrollPolicy.OPEN) {
    return { kind: "not-for-sale", price, reason: "คอร์สนี้รับผู้เรียนผ่านผู้สอน/ผู้ดูแล กรุณาติดต่อคณะที่เปิดสอน" };
  }
  if (!paymentEnabled) return { kind: "not-for-sale", price, reason: "ยังไม่เปิดขายออนไลน์ กรุณากลับมาใหม่ภายหลัง" };
  return { kind: "buy", price };
}
