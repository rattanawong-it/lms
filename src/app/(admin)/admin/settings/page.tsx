import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { ProtectionSwitch } from "@/features/protection/components/protection-switch";
import { isProtectionEnabledSystemWide } from "@/features/protection/queries";
import { BrandingForm } from "@/features/settings/components/branding-form";
import { TestSendButton } from "@/features/settings/components/test-send-button";
import { getBrandingEditor, getIntegrationStatus } from "@/features/settings/queries";
import { formatBytes } from "@/lib/upload-limits";

export const metadata: Metadata = { title: "ตั้งค่าระบบ" };

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant="secondary" className={ok ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      {label}
    </Badge>
  );
}

/**
 * M17 · FR-17.3 — ตั้งค่าระบบ (SUPER_ADMIN) · ค่า secret ของอีเมล/LINE อยู่ใน env เท่านั้น (Q8)
 * หน้านี้บอกได้แค่ว่าตั้งค่าไว้หรือยัง และให้ส่งทดสอบหาตัวเอง
 */
export default async function SettingsPage() {
  const [{ branding, logo }, status, protection] = await Promise.all([
    getBrandingEditor(),
    getIntegrationStatus(),
    isProtectionEnabledSystemWide(),
  ]);

  return (
    <>
      <PageHeader title="ตั้งค่าระบบ" description="ชื่อระบบ โลโก้ การป้องกันเนื้อหา และช่องทางแจ้งเตือน" />

      <div className="grid grid-cols-1 gap-5">
        <section aria-labelledby="branding" className="bg-card border-border min-w-0 rounded-xl border p-4">
          <h2 id="branding" className="mb-3 text-[15px] font-semibold">
            ชื่อระบบและโลโก้
          </h2>
          <BrandingForm
            name={branding.name}
            logo={
              logo
                ? { assetId: logo.id, originalName: logo.originalName, sizeLabel: formatBytes(Number(logo.size)) }
                : null
            }
          />
        </section>

        <ProtectionSwitch enabled={protection} />

        <section aria-labelledby="channels" className="bg-card border-border min-w-0 rounded-xl border p-4">
          <h2 id="channels" className="text-[15px] font-semibold">
            ช่องทางแจ้งเตือน
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-[12.5px]">
            รหัสผ่านและโทเค็นของผู้ให้บริการตั้งใน env ของเซิร์ฟเวอร์ ไม่เก็บในฐานข้อมูล — แก้ค่าแล้วต้องรีสตาร์ตเซิร์ฟเวอร์
          </p>

          <div className="divide-line divide-y">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3" data-channel="email">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  อีเมล <Status ok={status.email.configured} label={status.email.configured ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"} />
                </p>
                <p className="text-muted-foreground num mt-0.5 text-[12px] break-all">
                  ผู้ให้บริการ {status.email.provider.toUpperCase()} · ผู้ส่ง {status.email.from}
                </p>
              </div>
              <TestSendButton channel="email" label="ส่งอีเมลทดสอบถึงฉัน" disabled={!status.email.configured} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 py-3" data-channel="line">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  LINE <Status ok={status.line.configured} label={status.line.configured ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"} />
                </p>
                <p className="text-muted-foreground num mt-0.5 text-[12px]">
                  {status.line.basicId ? `Official Account ${status.line.basicId} · ` : ""}
                  ผูกบัญชีแล้ว {status.line.linkedUsers.toLocaleString("th-TH")} คน
                </p>
                {status.line.configured && !status.selfLineLinked ? (
                  <p className="text-muted-foreground mt-0.5 text-[12px]">
                    ผูก LINE ของคุณก่อนที่{" "}
                    <Link href="/settings/line" className="text-primary underline-offset-2 hover:underline">
                      ตั้งค่าบัญชี › LINE
                    </Link>{" "}
                    เพื่อส่งทดสอบ
                  </p>
                ) : null}
              </div>
              <TestSendButton
                channel="line"
                label="ส่ง LINE ทดสอบถึงฉัน"
                disabled={!status.line.configured || !status.selfLineLinked}
              />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
