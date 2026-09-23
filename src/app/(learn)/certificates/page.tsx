import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateLong } from "@/lib/dates";
import { getMyCertificates } from "@/features/certificates/queries";

export const metadata: Metadata = { title: "ใบประกาศของฉัน" };

/** M10 · FR-10.4 — ใบประกาศของผู้เรียน + ดาวน์โหลด PDF (signed URL) */
export default async function MyCertificatesPage() {
  const certificates = await getMyCertificates();

  return (
    <>
      <PageHeader
        title="ใบประกาศของฉัน"
        description="ได้รับอัตโนมัติเมื่อเรียนจบคอร์สตามเงื่อนไข · ทุกใบตรวจสอบได้จากรหัสหรือ QR บนใบ"
      />

      {certificates.length === 0 ? (
        <EmptyState
          icon={<Award className="size-5" />}
          title="ยังไม่มีใบประกาศ"
          description="เรียนจบคอร์สตามเงื่อนไขแล้ว ใบประกาศจะแสดงที่นี่"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {certificates.map((c) => (
            <li key={c.id}>
              <article aria-label={c.course.title} data-certificate className="bg-card border-border flex h-full flex-col rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <Award className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-semibold">{c.course.title}</h2>
                    <p className="text-muted-foreground text-[12.5px]">ออกเมื่อ {formatDateLong(c.issuedAt)}</p>
                    <p data-certificate-code className="mt-1 font-mono text-[13px]">
                      {c.code}
                    </p>
                  </div>
                  {c.revokedAt ? <Badge className="bg-danger-bg text-danger-fg border-0">ถูกเพิกถอน</Badge> : null}
                </div>
                <div className="border-line mt-3 flex flex-wrap gap-2 border-t pt-3">
                  {c.revokedAt ? null : (
                    <Button asChild size="sm" className="min-h-11">
                      <a href={`/api/certificate/${c.code}`}>
                        <Download className="size-4" /> ดาวน์โหลด PDF
                      </a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline" className="min-h-11">
                    <Link href={`/verify/${c.code}`}>
                      <ExternalLink className="size-4" /> หน้าตรวจสอบ
                    </Link>
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
