import type { Metadata } from "next";
import Link from "next/link";
import { Filter, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/shared/pager";
import { parseScreenEventFilter } from "@/features/protection/schemas";
import {
  getScreenEventReport,
  isProtectionEnabledSystemWide,
  SCREEN_EVENT_PAGE_SIZE,
} from "@/features/protection/queries";
import { ScreenEvent } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "ความปลอดภัยเนื้อหา" };

/** ข้อความภาษาไทยของแต่ละเหตุการณ์ (FR-15.8) */
const EVENT_LABEL: Record<ScreenEvent, string> = {
  [ScreenEvent.PRINTSCREEN]: "กดปุ่ม PrintScreen",
  [ScreenEvent.SHORTCUT]: "คีย์ลัดบันทึก/ดูซอร์ส",
  [ScreenEvent.CONTEXT_MENU]: "คลิกขวา",
  [ScreenEvent.COPY]: "คัดลอกข้อความ",
  [ScreenEvent.BLUR]: "สลับออกจากหน้าต่าง",
  [ScreenEvent.PRINT]: "สั่งพิมพ์",
  [ScreenEvent.DEVTOOLS]: "เปิดเครื่องมือนักพัฒนา",
};

const EVENT_TONE: Record<ScreenEvent, string> = {
  [ScreenEvent.PRINTSCREEN]: "bg-danger-bg text-danger-fg",
  [ScreenEvent.DEVTOOLS]: "bg-danger-bg text-danger-fg",
  [ScreenEvent.PRINT]: "bg-warning-bg text-warning-fg",
  [ScreenEvent.SHORTCUT]: "bg-warning-bg text-warning-fg",
  [ScreenEvent.COPY]: "bg-warning-bg text-warning-fg",
  [ScreenEvent.CONTEXT_MENU]: "bg-muted text-fg-3",
  [ScreenEvent.BLUR]: "bg-muted text-fg-3",
};

const inputClass =
  "border-input bg-card focus-visible:ring-ring h-11 w-full rounded-[9px] border px-3 text-[14px] outline-none focus-visible:ring-2";

/** M15 · FR-15.8 — รายงานเหตุการณ์หน้าจอ (กรอง + แบ่งหน้า · M16 ขั้น 6) · สวิตช์ระดับระบบอยู่ที่ /admin/settings (FR-17.3) */
export default async function ScreenEventsPage(props: PageProps<"/admin/screen-events">) {
  const filter = parseScreenEventFilter(await props.searchParams);
  const [report, systemEnabled] = await Promise.all([
    getScreenEventReport(filter),
    isProtectionEnabledSystemWide(),
  ]);
  const query: Record<string, string> = {
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.event ? { event: filter.event } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
  const filtered = Object.keys(query).length > 0;

  return (
    <>
      <PageHeader
        title="ความปลอดภัยเนื้อหา"
        description="เหตุการณ์ที่ระบบตรวจพบระหว่างผู้เรียนเปิดบทเรียน"
      />

      {/* สวิตช์ย้ายไปอยู่หน้าตั้งค่าระบบ (FR-17.3) — ที่นี่บอกสถานะให้รู้ว่าตอนนี้มีการเก็บเหตุการณ์หรือไม่ */}
      <p className="bg-card border-border mb-5 flex flex-wrap items-center gap-2 rounded-xl border p-4 text-[13px]" data-protection-status>
        {systemEnabled ? (
          <ShieldCheck className="text-success-fg size-[18px]" />
        ) : (
          <ShieldOff className="text-danger-fg size-[18px]" />
        )}
        การป้องกันเนื้อหาระดับระบบ{systemEnabled ? "เปิดอยู่" : "ปิดอยู่"}
        <Link href="/admin/settings" className="text-primary ml-auto underline-offset-2 hover:underline">
          เปลี่ยนที่หน้าตั้งค่าระบบ
        </Link>
      </p>

      <form
        aria-label="ตัวกรองเหตุการณ์"
        className="bg-card border-border mb-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_200px_160px_160px_auto] lg:items-end"
      >
        <div className="space-y-1">
          <label htmlFor="se-q" className="text-[12.5px] font-medium">ผู้ใช้ (ชื่อหรืออีเมล)</label>
          <input id="se-q" name="q" defaultValue={filter.q} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="se-event" className="text-[12.5px] font-medium">ชนิดเหตุการณ์</label>
          <select id="se-event" name="event" defaultValue={filter.event ?? ""} className={inputClass}>
            <option value="">ทุกชนิด</option>
            {Object.values(ScreenEvent).map((e) => (
              <option key={e} value={e}>
                {EVENT_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="se-from" className="text-[12.5px] font-medium">ตั้งแต่วันที่</label>
          <input id="se-from" type="date" name="from" defaultValue={filter.from ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="se-to" className="text-[12.5px] font-medium">ถึง</label>
          <input id="se-to" type="date" name="to" defaultValue={filter.to ?? ""} className={inputClass} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11">
            <Filter className="size-4" /> กรอง
          </Button>
          {filtered ? (
            <Button asChild variant="ghost" className="h-11">
              <Link href="/admin/screen-events">ล้าง</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {report.counts.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {report.counts.map((row) => (
            <Link
              key={row.event}
              href={`/admin/screen-events?${new URLSearchParams({ ...query, event: row.event })}`}
              aria-current={filter.event === row.event ? "true" : undefined}
              className="bg-card border-border hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-3 text-[12.5px] aria-[current=true]:border-ring"
            >
              {EVENT_LABEL[row.event]}{" "}
              <span className="num text-muted-foreground ml-1">{row.total.toLocaleString("th-TH")}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="events">
        <h2 id="events" className="mb-2 text-[15px] font-semibold">
          {filtered ? "เหตุการณ์ตามตัวกรอง" : "เหตุการณ์ล่าสุด"}
          <span className="text-muted-foreground num ml-2 text-[12.5px] font-normal" data-event-total>
            {report.total.toLocaleString("th-TH")} รายการ
            {report.total > SCREEN_EVENT_PAGE_SIZE ? ` · หน้าละ ${SCREEN_EVENT_PAGE_SIZE}` : ""}
          </span>
        </h2>

        {report.rows.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title={filtered ? "ไม่พบเหตุการณ์ตามตัวกรองนี้" : "ยังไม่พบเหตุการณ์ที่น่าสงสัย"}
            description="เมื่อผู้เรียนกดคีย์ลัดคัดลอกหน้าจอ เปิดเครื่องมือนักพัฒนา หรือสั่งพิมพ์บทเรียน รายการจะขึ้นที่นี่"
          />
        ) : (
          <div className="bg-card border-border overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[13px]">
                <caption className="sr-only">เหตุการณ์หน้าจอที่ระบบบันทึกไว้ล่าสุด</caption>
                <thead className="bg-background border-line text-muted-foreground border-b">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      เหตุการณ์
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      ผู้ใช้
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      บทเรียน
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      IP
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      เวลา
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {report.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={EVENT_TONE[row.event]}>
                          {EVENT_LABEL[row.event]}
                        </Badge>
                        {row.detail ? (
                          <span className="text-muted-foreground num ml-2 text-[11.5px]">
                            {row.detail}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.userName}</p>
                        <p className="text-muted-foreground num text-[11.5px]">{row.userEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        {row.lessonTitle ? (
                          <>
                            <p className="truncate">{row.lessonTitle}</p>
                            <p className="text-muted-foreground truncate text-[11.5px]">
                              {row.courseTitle}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground num px-4 py-3 text-[12px]">
                        {row.ip ?? "—"}
                      </td>
                      <td className="text-muted-foreground num px-4 py-3 text-[12px]">
                        {formatDateTime(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Pager basePath="/admin/screen-events" params={query} page={filter.page} pageCount={report.pageCount} />
      </section>

      <p className="text-muted-foreground mt-5 max-w-[720px] text-[12px] leading-relaxed">
        <strong className="text-foreground font-medium">ข้อจำกัดที่ต้องรู้:</strong>{" "}
        เว็บเบราว์เซอร์ตรวจจับการจับภาพระดับระบบปฏิบัติการไม่ได้ (Snipping Tool, การอัดหน้าจอ,
        การถ่ายด้วยกล้อง) รายการนี้จึงเป็นเพียงร่องรอยของความพยายามที่ตรวจจับได้เท่านั้น
        เครื่องมือหลักในการตามรอยคือลายน้ำที่ติดไปกับภาพเสมอ (spec §M15)
      </p>
    </>
  );
}
