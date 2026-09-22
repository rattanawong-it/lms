import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProtectionSwitch } from "@/features/protection/components/protection-switch";
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

/** M15 · FR-15.8 / FR-15.9 — รายงานเหตุการณ์หน้าจอ และสวิตช์การป้องกันระดับระบบ */
export default async function ScreenEventsPage() {
  const [report, systemEnabled] = await Promise.all([
    getScreenEventReport(),
    isProtectionEnabledSystemWide(),
  ]);

  return (
    <>
      <PageHeader
        title="ความปลอดภัยเนื้อหา"
        description="สวิตช์การป้องกันระดับระบบ และเหตุการณ์ที่ระบบตรวจพบระหว่างผู้เรียนเปิดบทเรียน"
      />

      <div className="mb-5">
        <ProtectionSwitch enabled={systemEnabled} />
      </div>

      {report.counts.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {report.counts.map((row) => (
            <span
              key={row.event}
              className="bg-card border-border rounded-lg border px-3 py-1.5 text-[12.5px]"
            >
              {EVENT_LABEL[row.event]}{" "}
              <span className="num text-muted-foreground">{row.total.toLocaleString("th-TH")}</span>
            </span>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="events">
        <h2 id="events" className="mb-2 text-[15px] font-semibold">
          เหตุการณ์ล่าสุด
          {report.total > SCREEN_EVENT_PAGE_SIZE ? (
            <span className="text-muted-foreground num ml-2 text-[12.5px] font-normal">
              แสดง {SCREEN_EVENT_PAGE_SIZE} จาก {report.total.toLocaleString("th-TH")} รายการ
            </span>
          ) : null}
        </h2>

        {report.rows.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title="ยังไม่พบเหตุการณ์ที่น่าสงสัย"
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
