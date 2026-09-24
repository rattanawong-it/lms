"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export type LineConnectView =
  | { state: "disabled" }
  | { state: "linked"; linkedAt: string }
  | { state: "unlinked"; code: { value: string; expiresAt: string } | null; oaId: string | null; addFriendUrl: string | null; qr: string | null };

/**
 * M12 · FR-12.1/12.4 — เชื่อมต่อ/ยกเลิก LINE
 * การผูกเกิดในแชท LINE (webhook) ไม่ใช่ในหน้านี้ — จึงมีปุ่ม "ตรวจสอบสถานะ" ให้โหลดข้อมูลใหม่
 */
export function LineConnect({
  view,
  requestCode,
  unlink,
}: {
  view: LineConnectView;
  requestCode: () => Promise<ActionResult>;
  unlink: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  if (view.state === "disabled") {
    return (
      <p className="bg-muted text-muted-foreground max-w-[640px] rounded-lg px-4 py-3 text-[13px]">
        ระบบยังไม่เปิดใช้การแจ้งเตือนทาง LINE — ติดต่อผู้ดูแลระบบหากต้องการใช้งาน
      </p>
    );
  }

  if (view.state === "linked") {
    return (
      <div data-line-status="linked" className="border-border bg-card max-w-[640px] space-y-3 rounded-xl border p-4 sm:p-5">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <CheckCircle2 className="text-success size-5" aria-hidden /> เชื่อมต่อ LINE แล้ว
        </p>
        <p className="text-muted-foreground text-[13px]">
          เชื่อมต่อเมื่อ {view.linkedAt} · เลือกว่าจะรับเรื่องใดทาง LINE ได้ที่{" "}
          <Link href="/settings/notifications" className="text-primary underline underline-offset-2">
            การแจ้งเตือน
          </Link>
        </p>
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(unlink)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          ยกเลิกการเชื่อมต่อ
        </Button>
      </div>
    );
  }

  return (
    <div data-line-status="unlinked" className="border-border bg-card max-w-[640px] space-y-4 rounded-xl border p-4 sm:p-5">
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">
        <li>
          เพิ่มบัญชี LINE ของระบบเป็นเพื่อน
          {view.oaId ? (
            <>
              {" "}(<span className="text-foreground font-medium">{view.oaId}</span>)
            </>
          ) : null}
        </li>
        <li>กด “เชื่อมต่อ LINE” เพื่อรับรหัส 6 หลัก</li>
        <li>พิมพ์รหัสในแชทกับบัญชี LINE ของระบบภายใน 10 นาที แล้วกด “ตรวจสอบสถานะ”</li>
      </ol>

      {view.addFriendUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          {view.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR เป็น data URI ที่สร้างฝั่ง server
            <img src={view.qr} alt="QR เพิ่มเพื่อนบัญชี LINE ของระบบ" width={120} height={120} className="rounded-md border" />
          ) : null}
          <Button asChild variant="outline">
            <a href={view.addFriendUrl} target="_blank" rel="noopener noreferrer">
              เพิ่มเพื่อนใน LINE
            </a>
          </Button>
        </div>
      ) : null}

      {view.code ? (
        <div className="bg-muted rounded-lg px-4 py-3">
          <p className="text-muted-foreground text-[12.5px]">รหัสเชื่อมต่อของคุณ (ใช้ได้ถึง {view.code.expiresAt})</p>
          <p data-line-code className="font-mono text-[28px] font-semibold tracking-[0.3em]" aria-live="polite">
            {view.code.value}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => run(requestCode)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {view.code ? "ขอรหัสใหม่" : "เชื่อมต่อ LINE"}
        </Button>
        {view.code ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => router.refresh()}>
            <RefreshCw className="size-4" /> ตรวจสอบสถานะ
          </Button>
        ) : null}
      </div>
    </div>
  );
}
