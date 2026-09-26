"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { submitForm } from "@/lib/form";
import { formatBaht } from "@/lib/payment/money";
import { recheckOrder, refundOrder } from "@/features/commerce/actions";
import type { RefundCheck } from "@/features/commerce/lib/refund-rules";

/**
 * FR-18.2 · Q6 — คืนเงินเต็มจำนวนพร้อมเหตุผล (ยืนยันก่อน · ย้อนกลับไม่ได้)
 * นอกนโยบาย 7 วัน/20% แสดงเหตุผลที่ขัดนโยบาย และต้องติ๊กยืนยันคืนเป็นกรณีพิเศษ
 */
export function RefundButton({
  orderId,
  amount,
  buyer,
  course,
  check,
}: {
  orderId: string;
  amount: string;
  buyer: string;
  course: string;
  check: Exclude<RefundCheck, { kind: "blocked" }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const reasonId = React.useId();
  const overrideId = React.useId();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await refundOrder(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-danger-fg min-h-11" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" /> คืนเงิน
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>คืนเงิน {formatBaht(amount)}?</DialogTitle>
            <DialogDescription>
              {buyer} · {course} — คืนเต็มจำนวน สิทธิ์เรียนคอร์สนี้สิ้นสุดและใบประกาศถูกเพิกถอน ย้อนกลับไม่ได้
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm(submit)} className="space-y-4">
            <input type="hidden" name="orderId" value={orderId} />
            {check.kind === "override" ? (
              <div className="bg-warning-bg text-warning-fg space-y-2 rounded-lg p-3 text-[13px]">
                <p className="font-medium">อยู่นอกนโยบายคืนเงิน (7 วัน · เรียนไม่เกิน 20%)</p>
                <ul className="list-disc pl-5">
                  {check.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <label htmlFor={overrideId} className="flex min-h-11 items-center gap-2 font-medium">
                  <input id={overrideId} type="checkbox" name="override" value="true" required className="size-4" />
                  ยืนยันคืนเงินเป็นกรณีพิเศษ
                </label>
              </div>
            ) : null}
            <div className="space-y-[7px]">
              <Label htmlFor={reasonId} className="text-[12.5px] font-medium">
                เหตุผล (บันทึกไว้ในประวัติคำสั่งซื้อและ audit)
              </Label>
              <textarea
                id={reasonId}
                name="reason"
                rows={3}
                maxLength={500}
                required
                aria-invalid={Boolean(errors.reason) || undefined}
                className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2"
              />
              {errors.reason ? (
                <p role="alert" className="text-danger-fg text-[12px] font-medium">
                  {errors.reason}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ยืนยันคืนเงิน
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** ถามสถานะล่าสุดจากผู้ให้บริการ — จ่ายแล้วแต่ webhook หาย / คืนเงินรอยืนยัน */
export function RecheckButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await recheckOrder(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submitForm(submit)}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="sm" variant="outline" className="min-h-11" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        ตรวจสอบกับผู้ให้บริการ
      </Button>
    </form>
  );
}
