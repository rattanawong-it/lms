"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
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
import { revokeCertificate } from "@/features/certificates/actions";

/** M10 · FR-10.5 — เพิกถอนใบประกาศพร้อมเหตุผล (ยืนยันก่อน · ย้อนกลับไม่ได้) */
export function RevokeButton({ certificateId, code, owner }: { certificateId: string; code: string; owner: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const reasonId = React.useId();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await revokeCertificate(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.fieldErrors?.reason ?? null);
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-danger-fg min-h-11" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> เพิกถอน
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิกถอนใบประกาศ {code}?</DialogTitle>
            <DialogDescription>
              ของ {owner} · หน้าตรวจสอบจะแสดงว่า “ถูกเพิกถอน” และผู้เรียนดาวน์โหลดไม่ได้อีก ย้อนกลับไม่ได้
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm(submit)} className="space-y-4">
            <input type="hidden" name="certificateId" value={certificateId} />
            <div className="space-y-[7px]">
              <Label htmlFor={reasonId} className="text-[12.5px] font-medium">
                เหตุผล (แจ้งผู้เรียนและบันทึกไว้ · ไม่แสดงบนหน้าตรวจสอบสาธารณะ)
              </Label>
              <textarea
                id={reasonId}
                name="reason"
                rows={3}
                maxLength={500}
                required
                aria-invalid={Boolean(error) || undefined}
                className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2"
              />
              {error ? (
                <p role="alert" className="text-danger-fg text-[12px] font-medium">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ยืนยันเพิกถอน
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
