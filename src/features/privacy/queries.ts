import "server-only";
import { db } from "@/lib/db";
import { requireAtLeast, requireUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

/** M17 · FR-17.4 PDPA */

/** SUPER_ADMIN คนอื่นที่ยังใช้งานได้ — ไม่มีเลย = คนนี้เป็นคนสุดท้าย ขอลบบัญชีไม่ได้ */
export async function otherActiveSuperAdmins(userId: string): Promise<number> {
  return db.user.count({
    where: { role: Role.SUPER_ADMIN, id: { not: userId }, banned: false, deletedAt: null },
  });
}

export async function getMyPrivacyState() {
  const user = await requireUser("/settings/privacy");
  const [row, others] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        deletionRequestedAt: true,
        deletionReason: true,
        pdpaConsentAt: true,
        accounts: { where: { providerId: "credential" }, select: { id: true } },
      },
    }),
    user.role === Role.SUPER_ADMIN ? otherActiveSuperAdmins(user.id) : Promise.resolve(1),
  ]);
  return {
    email: user.email,
    requestedAt: row.deletionRequestedAt,
    reason: row.deletionReason,
    pdpaConsentAt: row.pdpaConsentAt,
    /** บัญชีที่เข้าด้วย Google อย่างเดียวไม่มีรหัสผ่าน — ยืนยันด้วยการพิมพ์อีเมลแทน */
    hasPassword: row.accounts.length > 0,
    lastSuperAdmin: others === 0,
  };
}

export type DeletionRequestRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  requestedAt: Date;
  reason: string | null;
  enrollments: number;
  certificates: number;
};

/** คำขอลบบัญชีที่รออนุมัติ — เก่าสุดก่อน (FR-17.4 · Q9) */
export async function listDeletionRequests(): Promise<DeletionRequestRow[]> {
  await requireAtLeast(Role.SUPER_ADMIN);
  const rows = await db.user.findMany({
    where: { deletionRequestedAt: { not: null }, deletedAt: null },
    orderBy: { deletionRequestedAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: { select: { name: true } },
      deletionRequestedAt: true,
      deletionReason: true,
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    department: r.department?.name ?? null,
    requestedAt: r.deletionRequestedAt!,
    reason: r.deletionReason,
    enrollments: r._count.enrollments,
    certificates: r._count.certificates,
  }));
}

/** ตัวเลขบนเมนูผู้ดูแล */
export async function countDeletionRequests(): Promise<number> {
  await requireAtLeast(Role.SUPER_ADMIN);
  return db.user.count({ where: { deletionRequestedAt: { not: null }, deletedAt: null } });
}
