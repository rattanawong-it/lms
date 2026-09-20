import { Role } from "@/generated/prisma/enums";

/**
 * ส่วนของ RBAC ที่ใช้ได้ทั้ง server และ client (system-design §4.1)
 * แยกออกจาก `lib/rbac.ts` เพราะไฟล์นั้นเป็น server-only (next/headers + Prisma)
 * ที่นี่ต้องมีเฉพาะ type กับฟังก์ชัน pure เท่านั้น — ห้าม import db/auth
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  departmentId: string | null;
  banned: boolean;
  emailVerified: boolean;
};

/** ลำดับความสูงของสิทธิ์ — ใช้เทียบว่า role หนึ่ง "ไม่ต่ำกว่า" อีก role หนึ่ง */
export const ROLE_RANK: Record<Role, number> = {
  STUDENT: 0,
  INSTRUCTOR: 1,
  DEPT_ADMIN: 2,
  SUPER_ADMIN: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "ผู้ดูแลระบบสูงสุด",
  DEPT_ADMIN: "ผู้ดูแลคณะ/หน่วยงาน",
  INSTRUCTOR: "ผู้สอน",
  STUDENT: "ผู้เรียน",
};

export function isAtLeast(user: SessionUser, role: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[role];
}

/**
 * §2 กติกาการเปลี่ยน role
 * SUPER_ADMIN เปลี่ยนได้ทุกคนทุก role
 * DEPT_ADMIN เปลี่ยนได้เฉพาะคนในคณะตน และสูงสุดแค่ INSTRUCTOR
 */
export function canAssignRole(
  actor: SessionUser,
  target: { role: Role; departmentId: string | null },
  nextRole: Role,
): boolean {
  if (actor.role === Role.SUPER_ADMIN) return true;
  if (actor.role !== Role.DEPT_ADMIN) return false;
  if (!actor.departmentId) return false;
  if (target.departmentId !== actor.departmentId) return false;
  if (ROLE_RANK[target.role] > ROLE_RANK[Role.INSTRUCTOR]) return false;
  return ROLE_RANK[nextRole] <= ROLE_RANK[Role.INSTRUCTOR];
}

/** ขอบเขตข้อมูลผู้ใช้ที่ actor มีสิทธิ์เห็น — ใช้ประกอบ where ของ Prisma */
export function userScopeWhere(actor: SessionUser): { departmentId?: string } {
  if (actor.role === Role.SUPER_ADMIN) return {};
  if (actor.role === Role.DEPT_ADMIN && actor.departmentId) {
    return { departmentId: actor.departmentId };
  }
  // role อื่นไม่มีสิทธิ์เรียกดูรายชื่อผู้ใช้อยู่แล้ว (deny by default)
  return { departmentId: "__no_access__" };
}
