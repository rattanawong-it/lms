import "server-only";
import { db } from "@/lib/db";
import { requireAtLeast, userScopeWhere, type SessionUser } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { PAGE_SIZE, type UserFilter } from "@/features/users/schemas";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  externalId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: Date;
};

export type UserListResult = {
  rows: UserRow[];
  total: number;
  page: number;
  pageCount: number;
  actor: SessionUser;
};

/**
 * FR-02.2 — รายการผู้ใช้: ค้นหา, กรองตาม role/คณะ/สถานะ, แบ่งหน้า
 * NFR-04 · DEPT_ADMIN เห็นได้เฉพาะผู้ใช้ในคณะตนเอง (บังคับผ่าน userScopeWhere)
 */
export async function listUsers(filter: UserFilter): Promise<UserListResult> {
  const actor = await requireAtLeast(Role.DEPT_ADMIN);

  // บัญชีที่ anonymize แล้ว (FR-17.4) ไม่ใช่ผู้ใช้ที่จัดการได้อีก — ดูประวัติได้ที่ /admin/audit
  const where: Prisma.UserWhereInput = { ...userScopeWhere(actor), deletedAt: null };

  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { email: { contains: filter.q, mode: "insensitive" } },
      { externalId: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  if (filter.role) where.role = filter.role;
  if (filter.departmentId && actor.role === Role.SUPER_ADMIN) {
    where.departmentId = filter.departmentId;
  }
  if (filter.status === "active") where.banned = false;
  if (filter.status === "banned") where.banned = true;
  if (filter.status === "unverified") where.emailVerified = false;

  const skip = (filter.page - 1) * PAGE_SIZE;

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        banned: true,
        banReason: true,
        emailVerified: true,
        externalId: true,
        departmentId: true,
        createdAt: true,
        department: { select: { name: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role,
      banned: u.banned,
      banReason: u.banReason,
      emailVerified: u.emailVerified,
      externalId: u.externalId,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      createdAt: u.createdAt,
    })),
    total,
    page: filter.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    actor,
  };
}
