import { EnrollmentStatus } from "@/generated/prisma/enums";
import { QA_EDIT_WINDOW_MIN } from "@/features/qa/schemas";

/**
 * M13 · FR-13.1–13.4 — กติกาถาม-ตอบ (pure ทั้งไฟล์ — ใช้ทั้ง server, หน้าจอ และ unit test)
 */

export type QaPermissions = {
  /** ตั้งกระทู้และตอบได้ */
  canPost: boolean;
  /** ผู้สอน/ผู้ดูแล: ปักหมุด ซ่อน ลบ เลือกคำตอบที่ดีที่สุด และเห็นรายการที่ถูกซ่อน */
  canModerate: boolean;
};

type EnrollmentRow = { status: EnrollmentStatus; expiresAt: Date | null } | null;

/**
 * สิทธิ์ในกระดานถาม-ตอบของคอร์สหนึ่ง — `null` = ไม่มีสิทธิ์อ่าน
 *
 *   ผู้สอน/ผู้ดูแลคอร์ส       อ่าน · โพสต์ · ดูแล
 *   ผู้เรียน (ACTIVE/COMPLETED) อ่าน · โพสต์ (กติกาเดียวกับสิทธิ์ `learn`)
 *   ผู้เรียนที่หมดอายุแล้ว      อ่านอย่างเดียว (ทบทวนคำตอบเดิมได้)
 *   รออนุมัติ/ถอน/ไม่ได้ลงทะเบียน ไม่มีสิทธิ์
 */
export function qaPermissions(
  input: { isInstructor: boolean; isManager: boolean; enrollment: EnrollmentRow },
  now: Date = new Date(),
): QaPermissions | null {
  if (input.isInstructor || input.isManager) return { canPost: true, canModerate: true };

  const e = input.enrollment;
  if (!e) return null;
  const learning = e.status === EnrollmentStatus.ACTIVE || e.status === EnrollmentStatus.COMPLETED;
  const expired = e.status === EnrollmentStatus.EXPIRED || (e.expiresAt !== null && e.expiresAt <= now);
  if (!learning && e.status !== EnrollmentStatus.EXPIRED) return null;
  return { canPost: learning && !expired, canModerate: false };
}

/** รายการที่ถูกซ่อนเห็นได้เฉพาะผู้ดูแลและเจ้าของ (เจ้าของเห็นป้าย "ถูกซ่อน") */
export function canSee(item: { isHidden: boolean; authorId: string }, viewerId: string, perms: QaPermissions): boolean {
  return !item.isHidden || perms.canModerate || item.authorId === viewerId;
}

/**
 * ผู้เขียนแก้/ลบของตัวเองได้ภายใน 15 นาที **และ** ต้องยังไม่มีคนตอบ
 * (มีคนตอบแล้วแก้ทีหลังจะทำให้คำตอบไม่ตรงคำถาม) · หมดสิทธิ์โพสต์แล้วก็แก้ไม่ได้
 */
export function canEditOwn(
  item: { authorId: string; createdAt: Date; replyCount: number },
  viewerId: string,
  perms: QaPermissions,
  now: Date = new Date(),
): boolean {
  return (
    perms.canPost &&
    item.authorId === viewerId &&
    item.replyCount === 0 &&
    now.getTime() - item.createdAt.getTime() < QA_EDIT_WINDOW_MIN * 60 * 1000
  );
}

/** ตอบซ้อนได้ 1 ชั้น — ตอบคำตอบที่เป็นคำตอบย่อยอยู่แล้วจะผูกกับคำตอบระดับบนสุดของมัน */
export function replyParentId(target: { id: string; parentId: string | null }): string {
  return target.parentId ?? target.id;
}

/**
 * FR-13.4 — ผู้รับการแจ้งเตือนเมื่อมีคำตอบใหม่: เจ้าของกระทู้ + เจ้าของคำตอบที่ถูกตอบกลับ
 * ไม่แจ้งผู้ตอบเอง · ตัดคนซ้ำ
 */
export function replyRecipients(input: {
  threadAuthorId: string;
  parentAuthorId: string | null;
  actorId: string;
}): string[] {
  const ids = [input.threadAuthorId, input.parentAuthorId].filter((id): id is string => id !== null);
  return [...new Set(ids)].filter((id) => id !== input.actorId);
}

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string };

const URL_PATTERN = /https?:\/\/[^\s<>"'“”]+/g;
/** เครื่องหมายท้ายประโยคที่มักติดมากับลิงก์แต่ไม่ใช่ส่วนหนึ่งของลิงก์ */
const TRAILING = /[.,;:!?)\]}'"»]+$/;

/**
 * แยกข้อความล้วนเป็นช่วงข้อความ/ลิงก์ (Q5 — ลิงก์คลิกได้) · รับเฉพาะ http/https
 * ผู้แสดงผลต้องใช้ข้อความเป็น text node ของ React เท่านั้น (ห้าม `dangerouslySetInnerHTML`)
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = raw.replace(TRAILING, "");
    const start = match.index;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
