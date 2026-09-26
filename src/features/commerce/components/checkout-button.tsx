"use client";

import * as React from "react";
import { Loader2, ShieldCheck, TicketPercent, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { previewCoupon, startCheckout } from "@/features/commerce/actions";
import { formatBaht, toSatang } from "@/lib/payment/money";
import { submitForm } from "@/lib/form";

type Quote = { code: string; subtotal: string; discount: string; amount: string };

/**
 * FR-18.1/18.2 — สรุปยอด + คูปอง + ปุ่ม "ไปหน้าชำระเงิน"
 * ยอดหลังลดบนหน้าจอเป็นแค่ตัวอย่าง — server คำนวณใหม่และจองคูปองตอนสร้างคำสั่งซื้อ
 * ใช้ `location.assign` ไม่ใช่ router — ปลายทางเป็นโดเมนของ gateway (หรือหน้าจำลองที่ต้องโหลดใหม่ทั้งหน้า)
 */
export function CheckoutButton({ courseId, price }: { courseId: string; price: string }) {
  const [pending, startTransition] = React.useTransition();
  const [checking, startChecking] = React.useTransition();
  const [leaving, setLeaving] = React.useState(false);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [couponError, setCouponError] = React.useState<string | undefined>();

  function applyCoupon(formData: FormData) {
    const code = String(formData.get("couponCode") ?? "");
    startChecking(async () => {
      const result = await previewCoupon(formData);
      if (!result.ok) {
        setQuote(null);
        setCouponError(result.fieldErrors?.couponCode ?? result.message);
      } else if (result.quote) {
        setQuote({ code: code.trim().toUpperCase(), ...result.quote });
        setCouponError(undefined);
      }
    });
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await startCheckout(formData);
      if (result.redirectUrl) {
        setLeaving(true);
        window.location.assign(result.redirectUrl);
        return;
      }
      if (!result.ok) {
        // คูปองหมดสิทธิ์/หมดอายุระหว่างนั้น — กลับไปยอดเต็มให้ผู้ซื้อเห็นก่อนกดใหม่
        if (result.fieldErrors?.couponCode) {
          setQuote(null);
          setCouponError(result.fieldErrors.couponCode);
        }
        toast.error(result.message);
      }
    });
  }

  const busy = pending || leaving;
  const total = quote?.amount ?? price;
  const free = toSatang(total) === 0;

  return (
    <div className="space-y-5">
      <dl className="border-line space-y-2 border-t pt-4 text-[14px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">ราคา</dt>
          <dd className="num">{formatBaht(price)}</dd>
        </div>
        {quote ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">ส่วนลด (คูปอง {quote.code})</dt>
            <dd className="num text-success-fg" data-checkout-discount>
              −{formatBaht(quote.discount)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 text-[16px] font-bold">
          <dt>ยอดชำระ</dt>
          <dd className="num" data-checkout-total>
            {formatBaht(total)}
          </dd>
        </div>
      </dl>

      {quote ? (
        <div className="bg-success-bg text-success-fg flex items-center justify-between gap-2 rounded-lg px-3 py-1 text-[13px]">
          <span className="flex items-center gap-2">
            <TicketPercent className="size-4" /> ใช้คูปอง {quote.code} แล้ว
          </span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setQuote(null)}>
            <X className="size-4" /> เอาออก
          </Button>
        </div>
      ) : (
        <form onSubmit={submitForm(applyCoupon)} className="flex items-start gap-2">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="min-w-0 flex-1">
            <Field
              label="รหัสคูปอง (ถ้ามี)"
              name="couponCode"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={32}
              error={couponError}
              onChange={() => setCouponError(undefined)}
            />
          </div>
          <Button type="submit" variant="outline" className="mt-[26px] h-11" disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : null}
            ใช้คูปอง
          </Button>
        </form>
      )}

      <form onSubmit={submitForm(submit)} className="space-y-2">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="couponCode" value={quote?.code ?? ""} />
        <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {free ? "รับสิทธิ์เรียนด้วยคูปอง" : `ไปหน้าชำระเงิน ${formatBaht(total)}`}
        </Button>
        <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
          {free
            ? "คูปองนี้ลดเต็มจำนวน ไม่ต้องชำระเงิน"
            : "ระบบพาไปหน้าชำระเงินที่ปลอดภัยของผู้ให้บริการ · เราไม่เก็บข้อมูลบัตรของคุณ"}
        </p>
      </form>
    </div>
  );
}
