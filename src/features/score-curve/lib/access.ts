import { Role } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/roles";

/**
 * FR-09.7 · Q10 — ขอบเขต Score Curve ที่ผู้ใช้แก้ได้ (pure — ใช้ทั้ง queries/actions และ unit test)
 * SUPER_ADMIN: ทั้งระบบ + ทุกคณะ · DEPT_ADMIN: เฉพาะคณะตัวเอง · ผู้สอนตั้งทับได้เฉพาะคอร์สตน (ตรวจที่ gradebook/actions)
 */
export function canEditCurveScope(user: Pick<SessionUser, "role" | "departmentId">, scope: string): boolean {
  if (user.role === Role.SUPER_ADMIN) return true;
  return user.role === Role.DEPT_ADMIN && scope !== "system" && scope === user.departmentId;
}
