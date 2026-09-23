import { AnnouncementScope, Role } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/roles";

/**
 * M11 · FR-11.1 — ใครประกาศระดับไหนได้ และใครมองเห็นประกาศไหน
 *
 * เป็น pure function (ไม่มี server-only) เพื่อให้ unit test ได้ตรง ๆ
 * ระดับคอร์สตรวจสิทธิ์ด้วย `assertCourseAccess(courseId, "teach")` ใน actions.ts
 * เพราะต้องอ่านรายชื่อผู้สอนจาก DB
 */

/**
 * ประกาศระดับทั้งระบบ/คณะได้ไหม (system-design §4.1)
 *   GLOBAL     — Super Admin เท่านั้น
 *   DEPARTMENT — Super Admin ทุกคณะ · Dept Admin เฉพาะคณะของตัวเอง
 * ขอบเขตคณะเท่ากับ `userScopeWhere()` คือคณะเดียว ไม่รวมคณะย่อย
 */
export function canPostOrgAnnouncement(
  user: Pick<SessionUser, "role" | "departmentId">,
  scope: AnnouncementScope,
  departmentId: string | null,
): boolean {
  if (scope === AnnouncementScope.GLOBAL) return user.role === Role.SUPER_ADMIN;
  if (scope === AnnouncementScope.DEPARTMENT) {
    if (!departmentId) return false;
    if (user.role === Role.SUPER_ADMIN) return true;
    return (
      user.role === Role.DEPT_ADMIN &&
      user.departmentId !== null &&
      user.departmentId === departmentId
    );
  }
  return false;
}

/**
 * เงื่อนไขประกาศที่ผู้ใช้คนหนึ่งควรเห็น — ใช้เป็น `where` ของ Prisma
 *
 * `courseIds` คือคอร์สที่ผู้ใช้เรียนอยู่ (ACTIVE และยังไม่หมดอายุ) หรือเป็นผู้สอน
 * ผู้เรียนที่หมดสิทธิ์แล้วจึงไม่เห็นประกาศของคอร์สนั้นอีก
 */
export function visibleAnnouncementWhere(
  user: Pick<SessionUser, "departmentId">,
  courseIds: string[],
) {
  const or: (
    | { scope: "GLOBAL" }
    | { scope: "DEPARTMENT"; departmentId: string }
    | { scope: "COURSE"; courseId: { in: string[] } }
  )[] = [{ scope: AnnouncementScope.GLOBAL }];

  if (user.departmentId) {
    or.push({ scope: AnnouncementScope.DEPARTMENT, departmentId: user.departmentId });
  }
  if (courseIds.length > 0) {
    or.push({ scope: AnnouncementScope.COURSE, courseId: { in: courseIds } });
  }
  return { OR: or };
}

/** id ของ element ในหน้า /announcements — ลิงก์จากการแจ้งเตือนเลื่อนมาที่ประกาศนั้นตรง ๆ */
export function announcementAnchor(id: string): string {
  return `a-${id}`;
}

export function announcementLink(id: string): string {
  return `/announcements#${announcementAnchor(id)}`;
}
