import type { Metadata } from "next";
import { Search, TicketPercent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/dates";
import { formatBaht } from "@/lib/payment/money";
import { CouponForm, CouponToggle } from "@/features/commerce/components/coupon-form";
import { couponCourseOptions, listCoupons, type CouponRow } from "@/features/commerce/queries";

export const metadata: Metadata = { title: "คูปองส่วนลด" };

const STATE: Record<CouponRow["state"], { label: string; tone: string }> = {
  active: { label: "ใช้งานได้", tone: "bg-success-bg text-success-fg" },
  scheduled: { label: "ยังไม่ถึงวันเริ่ม", tone: "bg-warning-bg text-warning-fg" },
  exhausted: { label: "ใช้ครบแล้ว", tone: "bg-muted text-fg-3" },
  expired: { label: "หมดอายุ", tone: "bg-muted text-fg-3" },
  inactive: { label: "ปิดใช้", tone: "bg-danger-bg text-danger-fg" },
};

/** M18 · FR-18.2 — สร้าง/ปิดใช้คูปอง (Q3 ผู้ดูแลระบบเท่านั้น) */
export default async function AdminCouponsPage(props: PageProps<"/admin/coupons">) {
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q.slice(0, 32) : "";
  const [coupons, courses] = await Promise.all([listCoupons(q), couponCourseOptions()]);

  return (
    <>
      <PageHeader
        title="คูปองส่วนลด"
        description="ส่วนลดคิดจากราคาคอร์สตอนสร้างคำสั่งซื้อ · ลดจนเหลือ 0 บาทผู้ซื้อได้สิทธิ์ทันที · คำสั่งซื้อที่รอชำระจองสิทธิ์คูปองไว้ 30 นาที"
      />

      <section aria-labelledby="new-coupon" className="mb-6">
        <h2 id="new-coupon" className="mb-3 text-[15px] font-semibold">
          สร้างคูปองใหม่
        </h2>
        <CouponForm courses={courses} />
      </section>

      <section aria-labelledby="coupon-list">
        <h2 id="coupon-list" className="mb-3 text-[15px] font-semibold">
          คูปองทั้งหมด
        </h2>
        <form role="search" className="mb-4 flex gap-2">
          <Input name="q" defaultValue={q} placeholder="ค้นหารหัสคูปอง" aria-label="ค้นหารหัสคูปอง" className="bg-card h-11 max-w-[320px]" />
          <Button type="submit" variant="outline" className="h-11">
            <Search className="size-4" /> ค้นหา
          </Button>
        </form>

        {coupons.length === 0 ? (
          <EmptyState
            icon={<TicketPercent className="size-5" />}
            title={q ? "ไม่พบคูปองที่ตรงกับคำค้น" : "ยังไม่มีคูปอง"}
            description="สร้างคูปองจากฟอร์มด้านบน"
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {coupons.map((c) => (
              <li key={c.id} className="min-w-0">
                <article
                  aria-label={`คูปอง ${c.code}`}
                  data-coupon={c.code}
                  className="bg-card border-border flex flex-wrap items-center gap-3 rounded-xl border p-4"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[14px] font-semibold">{c.code}</span>
                      <span className="text-[14px]">
                        ลด {c.percentOff !== null ? `${c.percentOff}%` : formatBaht(c.amountOff!)}
                      </span>
                    </p>
                    <p className="text-fg-2 truncate text-[12.5px]">{c.course ? c.course.title : "ทุกคอร์สที่มีราคา"}</p>
                    <p className="text-muted-foreground text-[12px]">
                      ใช้แล้ว <span className="num">{c.usedCount}</span>
                      {c.maxUses !== null ? (
                        <>
                          {" "}
                          / <span className="num">{c.maxUses}</span> ครั้ง
                        </>
                      ) : (
                        " ครั้ง (ไม่จำกัด)"
                      )}
                      {c.reserved > 0 ? ` · รอชำระ ${c.reserved}` : ""}
                      {c.validFrom ? ` · เริ่ม ${formatDateTime(c.validFrom)}` : ""}
                      {c.validUntil ? ` · หมดอายุ ${formatDateTime(c.validUntil)}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`${STATE[c.state].tone} border-0`}>
                    {STATE[c.state].label}
                  </Badge>
                  <CouponToggle couponId={c.id} code={c.code} active={c.active} />
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
