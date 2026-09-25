"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startCheckout } from "@/features/commerce/actions";
import { submitForm } from "@/lib/form";

/**
 * FR-18.1 — ปุ่ม "ไปหน้าชำระเงิน" · server สร้างคำสั่งซื้อแล้วบอก URL ของผู้ให้บริการ
 * ใช้ `location.assign` ไม่ใช่ router — ปลายทางเป็นโดเมนของ gateway (หรือหน้าจำลองที่ต้องโหลดใหม่ทั้งหน้า)
 */
export function CheckoutButton({ courseId, label }: { courseId: string; label: string }) {
  const [pending, startTransition] = React.useTransition();
  const [leaving, setLeaving] = React.useState(false);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await startCheckout(formData);
      if (result.redirectUrl) {
        setLeaving(true);
        window.location.assign(result.redirectUrl);
        return;
      }
      if (!result.ok) toast.error(result.message);
    });
  }

  const busy = pending || leaving;
  return (
    <form onSubmit={submitForm(submit)} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {label}
      </Button>
      <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
        ระบบพาไปหน้าชำระเงินที่ปลอดภัยของผู้ให้บริการ · เราไม่เก็บข้อมูลบัตรของคุณ
      </p>
    </form>
  );
}
