import type { Metadata } from "next";
import Link from "next/link";
import { Award, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateLong } from "@/lib/dates";
import { RevokeButton } from "@/features/certificates/components/revoke-button";
import { getAdminCertificates } from "@/features/certificates/queries";

export const metadata: Metadata = { title: "ใบประกาศ" };

/** M10 · FR-10.5 — ค้นหาและเพิกถอนใบประกาศ (ผู้ดูแลคณะเห็นเฉพาะคอร์สของคณะตัวเอง) */
export default async function AdminCertificatesPage(props: PageProps<"/admin/certificates">) {
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q.slice(0, 100) : "";
  const certificates = await getAdminCertificates(q);

  return (
    <>
      <PageHeader title="ใบประกาศ" description="ค้นหาด้วยรหัส ชื่อ อีเมล หรือชื่อคอร์ส · แสดงล่าสุด 50 ใบ" />

      <form role="search" className="mb-4 flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="เช่น LMS-2026-8F3K2Q หรือชื่อผู้เรียน"
          aria-label="ค้นหาใบประกาศ"
          className="bg-card h-11 max-w-[420px]"
        />
        <Button type="submit" variant="outline" className="h-11">
          <Search className="size-4" /> ค้นหา
        </Button>
      </form>

      {certificates.length === 0 ? (
        <EmptyState
          icon={<Award className="size-5" />}
          title={q ? "ไม่พบใบประกาศที่ตรงกับคำค้น" : "ยังไม่มีใบประกาศ"}
          description="ใบประกาศออกอัตโนมัติเมื่อผู้เรียนผ่านเงื่อนไขการจบคอร์ส"
        />
      ) : (
        <ul className="space-y-3">
          {certificates.map((c) => (
            <li key={c.id}>
              <article
                aria-label={`${c.code} ${c.user.name}`}
                data-admin-certificate
                className="bg-card border-border flex flex-wrap items-center gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px] font-semibold">{c.code}</p>
                  <p className="text-[14px]">
                    {c.user.name} <span className="text-muted-foreground text-[12.5px] break-all">({c.user.email})</span>
                  </p>
                  <p className="text-fg-2 text-[12.5px]">
                    {c.course.title} · ออกเมื่อ {formatDateLong(c.issuedAt)}
                  </p>
                  {c.revokedAt ? (
                    <p className="text-danger-fg mt-1 text-[12.5px]">
                      เพิกถอนเมื่อ {formatDateLong(c.revokedAt)} — {c.revokeReason}
                    </p>
                  ) : null}
                </div>
                {c.revokedAt ? <Badge className="bg-danger-bg text-danger-fg border-0">ถูกเพิกถอน</Badge> : null}
                <Button asChild size="sm" variant="outline" className="min-h-11">
                  <Link href={`/verify/${c.code}`}>หน้าตรวจสอบ</Link>
                </Button>
                {c.revokedAt ? null : <RevokeButton certificateId={c.id} code={c.code} owner={c.user.name} />}
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
