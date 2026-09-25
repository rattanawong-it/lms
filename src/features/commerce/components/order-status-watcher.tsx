"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { checkOrderStatus } from "@/features/commerce/actions";

const POLL_MS = 3_000;
const MAX_POLLS = 60; // ~3 นาที แล้วให้ผู้ใช้กดตรวจเอง

/**
 * FR-18.1 — ระหว่างคำสั่งซื้อยัง PENDING ถามผลจาก server ทุก 3 วินาที (server ถามผู้ให้บริการอีกทอด)
 * สถานะเปลี่ยนแล้ว refresh ทั้งหน้าให้ server component แสดงผลจริง
 */
export function OrderStatusWatcher({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [polls, setPolls] = React.useState(0);
  const [checking, startTransition] = React.useTransition();

  const check = React.useCallback(() => {
    startTransition(async () => {
      const result = await checkOrderStatus(orderId);
      if (result && result.status !== "PENDING") router.refresh();
      setPolls((n) => n + 1);
    });
  }, [orderId, router]);

  React.useEffect(() => {
    if (polls >= MAX_POLLS) return;
    const timer = window.setTimeout(check, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [polls, check]);

  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]" aria-live="polite">
      <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
      <span>กำลังตรวจสอบการชำระเงินกับผู้ให้บริการ…</span>
      {polls >= MAX_POLLS ? (
        <button
          type="button"
          onClick={() => setPolls(0)}
          disabled={checking}
          className="text-primary min-h-11 underline-offset-2 hover:underline"
        >
          ตรวจสอบอีกครั้ง
        </button>
      ) : null}
    </div>
  );
}
