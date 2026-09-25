import "server-only";
import { db } from "@/lib/db";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";
import { AUDIT_PAGE_SIZE, type AuditFilter } from "@/features/audit/schemas";
import { reportDateRange } from "@/features/reports/lib/report";
import type { Prisma } from "@/generated/prisma/client";

/** M17 · FR-17.2 — ค้นหา audit log (SUPER_ADMIN เท่านั้น) */

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: Date;
};

export async function getAuditLog(filter: AuditFilter) {
  await requireAtLeast(Role.SUPER_ADMIN);

  const createdAt = reportDateRange(filter);
  const where: Prisma.AuditLogWhereInput = {
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.q
      ? {
          actor: {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { email: { contains: filter.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filter.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: rows.map(
      (r): AuditRow => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actorName: r.actor?.name ?? null,
        actorEmail: r.actor?.email ?? null,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.createdAt,
      }),
    ),
  };
}

/** ชนิดข้อมูลที่มีใน log — ตัวเลือกของตัวกรอง (ตารางชนิดมีไม่กี่สิบค่า ใช้ index `entity, entityId`) */
export async function getAuditEntities(): Promise<string[]> {
  await requireAtLeast(Role.SUPER_ADMIN);
  const rows = await db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } });
  return rows.map((r) => r.entity);
}
