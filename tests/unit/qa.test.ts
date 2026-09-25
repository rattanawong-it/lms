import { describe, expect, it } from "vitest";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { canEditOwn, canSee, linkify, qaPermissions, replyParentId, replyRecipients } from "@/features/qa/lib/rules";
import { createThreadSchema, parseQaParams, replySchema } from "@/features/qa/schemas";

/** M13 · FR-13.1–13.4 — กติกาถาม-ตอบ */

const NOW = new Date("2026-09-25T06:00:00.000Z");
const MIN = 60 * 1000;
const enrolled = (status: EnrollmentStatus, expiresAt: Date | null = null) => ({
  isInstructor: false,
  isManager: false,
  enrollment: { status, expiresAt },
});

describe("สิทธิ์ในกระดานถาม-ตอบ", () => {
  it("ผู้สอน/ผู้ดูแลคอร์ส: โพสต์และดูแลได้", () => {
    expect(qaPermissions({ isInstructor: true, isManager: false, enrollment: null }, NOW)).toEqual({ canPost: true, canModerate: true });
    expect(qaPermissions({ isInstructor: false, isManager: true, enrollment: null }, NOW)).toEqual({ canPost: true, canModerate: true });
  });

  it("ผู้เรียนที่ยังเรียนอยู่ (รวมเรียนจบแล้ว) โพสต์ได้แต่ดูแลไม่ได้", () => {
    for (const status of [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED]) {
      expect(qaPermissions(enrolled(status), NOW)).toEqual({ canPost: true, canModerate: false });
    }
  });

  it("หมดอายุแล้ว: อ่านได้อย่างเดียว", () => {
    expect(qaPermissions(enrolled(EnrollmentStatus.ACTIVE, new Date(NOW.getTime() - MIN)), NOW)).toEqual({ canPost: false, canModerate: false });
    expect(qaPermissions(enrolled(EnrollmentStatus.ACTIVE, NOW), NOW)).toEqual({ canPost: false, canModerate: false });
    expect(qaPermissions(enrolled(EnrollmentStatus.EXPIRED), NOW)).toEqual({ canPost: false, canModerate: false });
  });

  it("ไม่ได้ลงทะเบียน (ผู้เรียนคอร์สอื่น) / รออนุมัติ / ถอนแล้ว: ไม่มีสิทธิ์อ่าน", () => {
    expect(qaPermissions({ isInstructor: false, isManager: false, enrollment: null }, NOW)).toBeNull();
    expect(qaPermissions(enrolled(EnrollmentStatus.PENDING), NOW)).toBeNull();
    expect(qaPermissions(enrolled(EnrollmentStatus.DROPPED), NOW)).toBeNull();
  });

  it("ซ่อนแล้ว: เห็นเฉพาะผู้ดูแลและเจ้าของ", () => {
    const hidden = { isHidden: true, authorId: "owner" };
    const learner = { canPost: true, canModerate: false };
    expect(canSee(hidden, "other", learner)).toBe(false);
    expect(canSee(hidden, "owner", learner)).toBe(true);
    expect(canSee(hidden, "teacher", { canPost: true, canModerate: true })).toBe(true);
    expect(canSee({ isHidden: false, authorId: "owner" }, "other", learner)).toBe(true);
  });
});

describe("แก้/ลบของตัวเอง", () => {
  const perms = { canPost: true, canModerate: false };
  const item = { authorId: "me", createdAt: new Date(NOW.getTime() - 14 * MIN), replyCount: 0 };

  it("ภายใน 15 นาทีและยังไม่มีคนตอบ", () => {
    expect(canEditOwn(item, "me", perms, NOW)).toBe(true);
    expect(canEditOwn({ ...item, createdAt: new Date(NOW.getTime() - 15 * MIN) }, "me", perms, NOW)).toBe(false);
    expect(canEditOwn({ ...item, replyCount: 1 }, "me", perms, NOW)).toBe(false);
    expect(canEditOwn(item, "someone-else", perms, NOW)).toBe(false);
    expect(canEditOwn(item, "me", { canPost: false, canModerate: false }, NOW)).toBe(false);
  });
});

describe("ตอบซ้อนและผู้รับแจ้งเตือน", () => {
  it("ตอบคำตอบย่อย → ผูกกับคำตอบระดับบนสุด", () => {
    expect(replyParentId({ id: "top", parentId: null })).toBe("top");
    expect(replyParentId({ id: "child", parentId: "top" })).toBe("top");
  });

  it("แจ้งเจ้าของกระทู้ + เจ้าของคำตอบที่ถูกตอบ ไม่แจ้งตัวเอง ไม่ซ้ำ", () => {
    expect(replyRecipients({ threadAuthorId: "a", parentAuthorId: "b", actorId: "c" })).toEqual(["a", "b"]);
    expect(replyRecipients({ threadAuthorId: "a", parentAuthorId: "a", actorId: "c" })).toEqual(["a"]);
    expect(replyRecipients({ threadAuthorId: "a", parentAuthorId: null, actorId: "a" })).toEqual([]);
    expect(replyRecipients({ threadAuthorId: "a", parentAuthorId: "b", actorId: "b" })).toEqual(["a"]);
  });
});

describe("ข้อความล้วน (Q5)", () => {
  it("ทำลิงก์ http/https ให้คลิกได้ ตัดเครื่องหมายท้ายประโยค", () => {
    expect(linkify("ดู https://example.com/a?b=1. แล้วตอบ")).toEqual([
      { type: "text", value: "ดู " },
      { type: "link", value: "https://example.com/a?b=1" },
      { type: "text", value: ". แล้วตอบ" },
    ]);
    expect(linkify("(http://x.test)")).toEqual([
      { type: "text", value: "(" },
      { type: "link", value: "http://x.test" },
      { type: "text", value: ")" },
    ]);
  });

  it("ไม่ทำลิงก์ให้ scheme อื่น และไม่แปลง HTML", () => {
    expect(linkify("javascript:alert(1) <b>x</b>")).toEqual([{ type: "text", value: "javascript:alert(1) <b>x</b>" }]);
    expect(linkify("")).toEqual([]);
  });

  it("บีบบรรทัดว่าง ตัดช่องว่างหัวท้าย และปฏิเสธข้อความว่าง", () => {
    const ok = replySchema.safeParse({ threadId: "ckabcdefghijklmnopqrstuvw", body: "  บรรทัด 1\r\n\r\n\r\n\r\nบรรทัด 2  " });
    expect(ok.success && ok.data.body).toBe("บรรทัด 1\n\nบรรทัด 2");
    const empty = createThreadSchema.safeParse({ courseId: "ckabcdefghijklmnopqrstuvw", title: "หัวข้อ", body: "   " });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0]!.message).toBe("กรุณาเขียนรายละเอียดคำถาม");
  });

  it("ตัวกรองจาก URL ที่ไม่ถูกต้องใช้ค่าเริ่มต้น", () => {
    expect(parseQaParams({ filter: "evil", lesson: "not-an-id", page: "-3" })).toEqual({ filter: "all", lessonId: null, page: 1 });
    expect(parseQaParams({}, "unanswered").filter).toBe("unanswered");
    expect(parseQaParams({ filter: "resolved", page: "2" })).toMatchObject({ filter: "resolved", page: 2 });
  });
});
