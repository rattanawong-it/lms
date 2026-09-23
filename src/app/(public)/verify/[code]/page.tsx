import type { Metadata } from "next";
import { BadgeCheck, CircleSlash, SearchX, ShieldAlert } from "lucide-react";
import { formatDateLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getVerification } from "@/features/certificates/queries";

export const metadata: Metadata = {
  title: "ตรวจสอบใบประกาศ",
  // หน้าที่มีชื่อบุคคล — ไม่ให้เครื่องมือค้นหาเก็บ
  robots: { index: false, follow: false },
};

/**
 * M10 · FR-10.3 / FR-10.5 — ตรวจสอบใบประกาศ (สาธารณะ ไม่ต้องล็อกอิน)
 * แสดงชื่อ คอร์ส วันที่ และสถานะ · ไม่แสดงเหตุผลการเพิกถอน · จำกัดความถี่ต่อ IP กันการไล่สุ่มรหัส
 */
export default async function VerifyPage(props: PageProps<"/verify/[code]">) {
  const { code } = await props.params;
  const result = await getVerification(code);

  const tone =
    result.state === "valid"
      ? { icon: BadgeCheck, title: "ใบประกาศนี้ถูกต้อง", box: "bg-success-bg", fg: "text-success-fg" }
      : result.state === "revoked"
        ? { icon: CircleSlash, title: "ใบประกาศนี้ถูกเพิกถอนแล้ว", box: "bg-danger-bg", fg: "text-danger-fg" }
        : result.state === "limited"
          ? { icon: ShieldAlert, title: "ตรวจสอบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่", box: "bg-warning-bg", fg: "text-warning-fg" }
          : { icon: SearchX, title: "ไม่พบใบประกาศรหัสนี้", box: "bg-muted", fg: "text-fg-2" };
  const Icon = tone.icon;

  return (
    <div className="mx-auto max-w-[560px] px-4 py-10">
      <h1 className="mb-4 text-[22px] font-bold tracking-[-0.018em]">ตรวจสอบใบประกาศ</h1>
      <section aria-live="polite" data-verify-state={result.state} className={cn("rounded-xl p-5", tone.box)}>
        <p className={cn("flex items-center gap-2 text-[16px] font-semibold", tone.fg)}>
          <Icon className="size-6 shrink-0" aria-hidden /> {tone.title}
        </p>

        {result.state === "valid" || result.state === "revoked" ? (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-fg-2">รหัส</dt>
            <dd className="font-mono">{result.code}</dd>
            <dt className="text-fg-2">ผู้ได้รับ</dt>
            <dd data-verify-name className="font-semibold">{result.name}</dd>
            <dt className="text-fg-2">หลักสูตร</dt>
            <dd>{result.course}</dd>
            <dt className="text-fg-2">วันที่ออก</dt>
            <dd>{formatDateLong(result.issuedAt)}</dd>
            {result.revokedAt ? (
              <>
                <dt className="text-fg-2">เพิกถอนเมื่อ</dt>
                <dd>{formatDateLong(result.revokedAt)}</dd>
              </>
            ) : null}
          </dl>
        ) : result.state === "not-found" ? (
          <p className="text-fg-2 mt-2 font-mono text-[13px]">{result.code}</p>
        ) : null}
      </section>
      <p className="text-muted-foreground mt-4 text-[12.5px]">
        ข้อมูลจากระบบจัดการเรียนรู้ มหาวิทยาลัยเกริก · ข้อมูลบนหน้านี้คือแหล่งยืนยันที่ถูกต้องที่สุด
      </p>
    </div>
  );
}
