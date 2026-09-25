import type { Metadata } from "next";
import Link from "next/link";
import { Filter, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/shared/pager";
import { AUDIT_PAGE_SIZE, auditQuery, parseAuditFilter } from "@/features/audit/schemas";
import { getAuditEntities, getAuditLog } from "@/features/audit/queries";
import { auditDiff } from "@/features/audit/lib/json";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "บันทึกการใช้งาน" };

const inputClass =
  "border-input bg-card focus-visible:ring-ring h-11 w-full rounded-[9px] border px-3 text-[14px] outline-none focus-visible:ring-2";

/** M17 · FR-17.2 — ค้นหา audit log ตามผู้กระทำ, action, ชนิดข้อมูล/id และช่วงวันที่ · กดแต่ละแถวเพื่อดูค่าก่อน/หลัง */
export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const filter = parseAuditFilter(await props.searchParams);
  const [log, entities] = await Promise.all([getAuditLog(filter), getAuditEntities()]);
  const query = auditQuery(filter);
  const filtered = Object.keys(query).length > 0;

  return (
    <>
      <PageHeader
        title="บันทึกการใช้งาน"
        description="ใครทำอะไรกับข้อมูลใด เมื่อไร จาก IP ใด พร้อมค่าก่อนและหลังการแก้ไข (FR-17.1)"
      />

      <form
        aria-label="ตัวกรองบันทึกการใช้งาน"
        className="bg-card border-border mb-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_1fr_160px_1fr_150px_150px_auto] xl:items-end"
      >
        <div className="space-y-1">
          <label htmlFor="au-q" className="text-[12.5px] font-medium">ผู้กระทำ (ชื่อหรืออีเมล)</label>
          <input id="au-q" name="q" defaultValue={filter.q} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="au-action" className="text-[12.5px] font-medium">การกระทำ (ขึ้นต้นด้วย)</label>
          <input id="au-action" name="action" defaultValue={filter.action} placeholder="เช่น user." className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="au-entity" className="text-[12.5px] font-medium">ชนิดข้อมูล</label>
          <select id="au-entity" name="entity" defaultValue={filter.entity} className={inputClass}>
            <option value="">ทุกชนิด</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="au-id" className="text-[12.5px] font-medium">รหัสข้อมูล (id)</label>
          <input id="au-id" name="entityId" defaultValue={filter.entityId} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="au-from" className="text-[12.5px] font-medium">ตั้งแต่วันที่</label>
          <input id="au-from" type="date" name="from" defaultValue={filter.from ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="au-to" className="text-[12.5px] font-medium">ถึง</label>
          <input id="au-to" type="date" name="to" defaultValue={filter.to ?? ""} className={inputClass} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11">
            <Filter className="size-4" /> ค้นหา
          </Button>
          {filtered ? (
            <Button asChild variant="ghost" className="h-11">
              <Link href="/admin/audit">ล้าง</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <section aria-labelledby="audit-rows">
        <h2 id="audit-rows" className="mb-2 text-[15px] font-semibold">
          {filtered ? "ผลการค้นหา" : "รายการล่าสุด"}
          <span className="text-muted-foreground num ml-2 text-[12.5px] font-normal" data-audit-total>
            {log.total.toLocaleString("th-TH")} รายการ
            {log.total > AUDIT_PAGE_SIZE ? ` · หน้าละ ${AUDIT_PAGE_SIZE}` : ""}
          </span>
        </h2>

        {log.rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-6" />}
            title={filtered ? "ไม่พบรายการตามตัวกรองนี้" : "ยังไม่มีบันทึกการใช้งาน"}
            description="ทุกการแก้ไขข้อมูลสำคัญในระบบจะถูกบันทึกไว้ที่นี่"
          />
        ) : (
          <ul className="bg-card border-border divide-line divide-y overflow-hidden rounded-xl border">
            {log.rows.map((row) => {
              const diff = auditDiff(row.before, row.after);
              return (
                <li key={row.id}>
                  <details className="group" data-audit-row={row.action}>
                    <summary className="hover:bg-muted/50 grid min-h-11 cursor-pointer grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                      <span className="min-w-0">
                        <Badge variant="secondary" className="num max-w-full truncate font-mono text-[11.5px]">
                          {row.action}
                        </Badge>
                      </span>
                      <span className="min-w-0 text-[13px]">
                        <span className="block truncate font-medium">{row.actorName ?? "ระบบ"}</span>
                        {row.actorEmail ? (
                          <span className="text-muted-foreground num block truncate text-[11.5px]">{row.actorEmail}</span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground min-w-0 truncate text-[12px]">
                        {row.entity}
                        {row.entityId ? <span className="num font-mono"> · {row.entityId}</span> : null}
                      </span>
                      <span className="text-muted-foreground num text-[12px] sm:text-right">
                        {formatDateTime(row.createdAt)}
                      </span>
                    </summary>

                    <div className="bg-background border-line border-t px-4 py-3 text-[12.5px]">
                      <p className="text-muted-foreground mb-2 text-[12px]">
                        IP: <span className="num">{row.ip ?? "—"}</span>
                        {row.entityId ? (
                          <>
                            {" · "}
                            <Link
                              className="text-primary underline-offset-2 hover:underline"
                              href={`/admin/audit?${new URLSearchParams({ entity: row.entity, entityId: row.entityId })}`}
                            >
                              ประวัติทั้งหมดของข้อมูลนี้
                            </Link>
                          </>
                        ) : null}
                      </p>
                      {diff.length === 0 ? (
                        <p className="text-muted-foreground">ไม่มีรายละเอียดค่าก่อน/หลัง</p>
                      ) : (
                        <dl className="grid grid-cols-1 gap-2">
                          {diff.map((d) => (
                            <div
                              key={d.key}
                              data-changed={d.changed || undefined}
                              className="border-line grid grid-cols-1 gap-1 rounded-lg border p-2 data-[changed]:border-amber-400/60 sm:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]"
                            >
                              <dt className="font-mono text-[12px] font-medium break-all">{d.key}</dt>
                              <dd className="min-w-0">
                                <span className="text-muted-foreground mr-1 text-[11px]">ก่อน</span>
                                <span className="font-mono break-all whitespace-pre-wrap">{d.before ?? "—"}</span>
                              </dd>
                              <dd className="min-w-0">
                                <span className="text-muted-foreground mr-1 text-[11px]">หลัง</span>
                                <span className="font-mono break-all whitespace-pre-wrap">{d.after ?? "—"}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <Pager basePath="/admin/audit" params={query} page={filter.page} pageCount={log.pageCount} />
      </section>
    </>
  );
}
