import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, notFound, redirect, unauthorized } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";
import { ROLE_RANK, isAtLeast, type SessionUser } from "@/lib/roles";

/**
 * Data Access Layer — จุดเดียวที่ตรวจสิทธิ์ (system-design §4.2, NFR-04 deny by default)
 * ทุก queries.ts / actions.ts ต้องเรียก requireUser() หรือ requireRole() เป็นบรรทัดแรก
 *
 * ส่วนที่ client component ใช้ร่วมได้ (type, ROLE_LABEL, canAssignRole ฯลฯ) อยู่ใน `lib/roles.ts`
 * และ re-export ต่อจากที่นี่ เพื่อให้ฝั่ง server import จุดเดียวได้เหมือนเดิม
 */
export {
  ROLE_LABEL,
  ROLE_RANK,
  canAssignRole,
  isAtLeast,
  userScopeWhere,
  type SessionUser,
} from "@/lib/roles";

/** อ่าน session ปัจจุบัน — cache ต่อ request เพื่อไม่ query ซ้ำใน render เดียว */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const u = session.user as typeof session.user & {
    role?: string | null;
    departmentId?: string | null;
    banned?: boolean | null;
  };

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: (u.role as Role) ?? Role.STUDENT,
    departmentId: u.departmentId ?? null,
    banned: Boolean(u.banned),
    emailVerified: Boolean(u.emailVerified),
  };
});

/** ต้อง login — ถ้ายังไม่ login ให้ไปหน้า /login พร้อมจำปลายทาง */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  if (user.banned) forbidden();
  return user;
}

/** ต้องมี role ที่กำหนด — ไม่ตรงให้ 403 (§4.1 permission matrix) */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) forbidden();
  return user;
}

/** ต้องมีสิทธิ์ไม่ต่ำกว่า role ที่กำหนด */
export async function requireAtLeast(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[role]) forbidden();
  return user;
}

/** ใช้ใน Route Handler / API ที่ต้องตอบ 401 แทนการ redirect */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  if (user.banned) forbidden();
  return user;
}

/**
 * ระดับสิทธิ์ที่ต้องมีต่อคอร์สหนึ่ง (system-design §4.2)
 *   learn  — ผู้เรียนที่ลงทะเบียนแล้ว (ใช้ใน M06)
 *   teach  — ผู้สอนของคอร์สนั้น (แก้เนื้อหา ตรวจงาน)
 *   manage — ผู้ดูแลคณะเจ้าของคอร์สขึ้นไป (อนุมัติเผยแพร่ เปลี่ยนคณะ)
 */
export type CourseAccessLevel = "learn" | "teach" | "manage";

export type CourseAccess = {
  courseId: string;
  user: SessionUser;
  /** เป็นผู้สอนที่ถูกกำหนดให้คอร์สนี้ */
  isInstructor: boolean;
  /** ดูแลคอร์สนี้ได้ในฐานะผู้ดูแล (SUPER_ADMIN หรือ DEPT_ADMIN ของคณะเจ้าของคอร์ส) */
  isManager: boolean;
};

/**
 * ตรวจสิทธิ์ต่อคอร์สหนึ่ง — ทุก action/query ของ M04 ขึ้นไปต้องเรียกเป็นบรรทัดแรก
 *
 * แยกกรณี "ไม่มีคอร์ส" ออกเป็น notFound() และ "มีคอร์สแต่ไม่มีสิทธิ์" เป็น forbidden()
 * ต่างกันเฉพาะกับคนที่ผ่าน requireUser() มาแล้ว จึงไม่ได้บอกอะไรกับคนนอกระบบ
 */
export async function assertCourseAccess(
  courseId: string,
  level: CourseAccessLevel,
): Promise<CourseAccess> {
  const user = await requireUser();

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      departmentId: true,
      instructors: { select: { userId: true } },
    },
  });
  if (!course) notFound();

  const isInstructor = course.instructors.some((i) => i.userId === user.id);
  const isManager =
    user.role === Role.SUPER_ADMIN ||
    (user.role === Role.DEPT_ADMIN &&
      user.departmentId !== null &&
      user.departmentId === course.departmentId);

  const access: CourseAccess = { courseId: course.id, user, isInstructor, isManager };

  switch (level) {
    case "manage":
      if (!isManager) forbidden();
      break;

    case "teach":
      // ผู้ดูแลแก้คอร์สในขอบเขตตนเองได้ด้วย เพื่อให้ช่วยผู้สอนแก้ไขได้ตาม §4.1
      if (!isInstructor && !isManager) forbidden();
      break;

    case "learn": {
      if (isInstructor || isManager) break;
      const enrolled = await db.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        select: { id: true, status: true, expiresAt: true },
      });
      const active =
        enrolled?.status === "ACTIVE" &&
        (enrolled.expiresAt === null || enrolled.expiresAt > new Date());
      if (!active) forbidden();
      break;
    }
  }

  return access;
}

/** ผู้ใช้คนนี้สร้างคอร์สใหม่ได้หรือไม่ (§4.1 — INSTRUCTOR ขึ้นไป) */
export async function requireCourseCreator(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAtLeast(user, Role.INSTRUCTOR)) forbidden();
  return user;
}
