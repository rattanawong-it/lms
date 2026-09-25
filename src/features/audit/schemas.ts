/** M17 · FR-17.2 — ตัวกรองหน้าค้นหา audit log (ค่าอยู่ใน URL) · วันที่เป็น "YYYY-MM-DD" ตามเวลาไทย */
export type AuditFilter = {
  /** ผู้กระทำ — ชื่อหรืออีเมล */
  q: string;
  /** ขึ้นต้นด้วย เช่น "user." หรือ "user.role.update" */
  action: string;
  entity: string;
  entityId: string;
  from: string | null;
  to: string | null;
  page: number;
};

export const AUDIT_PAGE_SIZE = 50;

export function parseAuditFilter(input: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  // action/entity เป็นชื่อในโค้ด — ตัดอักขระอื่นทิ้ง กัน URL แปลก ๆ
  const ident = (v: string) => v.trim().replace(/[^\w.-]/g, "").slice(0, 60);
  const page = Number.parseInt(one(input.page) || "1", 10);
  return {
    q: one(input.q).trim().slice(0, 100),
    action: ident(one(input.action)),
    entity: ident(one(input.entity)),
    entityId: ident(one(input.entityId)),
    from: date(one(input.from)),
    to: date(one(input.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function auditQuery(filter: AuditFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (filter.q) out.q = filter.q;
  if (filter.action) out.action = filter.action;
  if (filter.entity) out.entity = filter.entity;
  if (filter.entityId) out.entityId = filter.entityId;
  if (filter.from) out.from = filter.from;
  if (filter.to) out.to = filter.to;
  return out;
}
