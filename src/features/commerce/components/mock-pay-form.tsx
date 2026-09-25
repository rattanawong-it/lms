"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payWithMock } from "@/features/commerce/actions";

/** หน้าชำระเงินจำลอง (dev/e2e) — ปุ่มเลือกผลลัพธ์แทนการกรอกบัตร/สแกน QR */
export function MockPayForm({ orderId, providerRef }: { orderId: string; providerRef: string }) {
  const [pending, startTransition] = React.useTransition();

  function pay(outcome: "paid" | "failed", method: "card" | "promptpay") {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("ref", providerRef);
    formData.set("outcome", outcome);
    formData.set("method", method);
    startTransition(async () => {
      const result = await payWithMock(formData);
      if (!result.ok) toast.error(result.message);
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Button type="button" className="h-11" disabled={pending} onClick={() => pay("paid", "card")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        จ่ายด้วยบัตร (สำเร็จ)
      </Button>
      <Button type="button" className="h-11" disabled={pending} onClick={() => pay("paid", "promptpay")}>
        จ่ายด้วย PromptPay (สำเร็จ)
      </Button>
      <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => pay("failed", "card")}>
        จำลองการจ่ายไม่สำเร็จ
      </Button>
    </div>
  );
}
