import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { auth } from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";
import { ROLE_RANK, type SessionUser } from "@/lib/roles";

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
