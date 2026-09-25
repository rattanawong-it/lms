"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelAccountDeletion, requestAccountDeletion } from "@/features/privacy/actions";
import { submitForm } from "@/lib/form";

const textareaClass =
  "border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2 text-[14px] outline-none focus-visible:ring-2";

/** FR-17.4 — ส่งคำขอลบบัญชี (ยืนยันตัวตนอีกครั้ง) หรือยกเลิกคำขอที่รอพิจารณา */
export function DeletionRequest({
  pending: requested,
  hasPassword,
  lastSuperAdmin,
}: {
  /** วันที่ส่งคำขอ (ข้อความไทย) · null = ยังไม่ได้ขอ */
  pending: { requestedAt: string; reason: string | null } | null;
  hasPassword: boolean;
  lastSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await requestAccountDeletion(formData);
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (requested) {
    return (
      <div className="bg-warning-bg text-warning-fg rounded-lg p-4 text-[13px]" data-deletion-state="pending">
        <p className="font-semibold">ส่งคำขอลบบัญชีแล้วเมื่อ {requested.requestedAt} — รอผู้ดูแลระบบพิจารณา</p>
        {requested.reason ? <p className="mt-1">เหตุผลที่แจ้ง: {requested.reason}</p> : null}
        <p className="mt-1">ระหว่างนี้ยังใช้งานได้ตามปกติ และยกเลิกคำขอได้จนกว่าจะได้รับการอนุมัติ</p>
        <Button type="button" variant="outline" className="mt-3 h-11" disabled={busy} onClick={cancel}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          ยกเลิกคำขอลบบัญชี
        </Button>
      </div>
    );
  }

  if (lastSuperAdmin) {
    return (
      <p className="bg-muted rounded-lg p-4 text-[13px]">
        คุณเป็นผู้ดูแลระบบคนสุดท้าย จึงขอลบบัญชีไม่ได้ — แต่งตั้งผู้ดูแลระบบคนอื่นก่อน
      </p>
    );
  }

  return (
    <form onSubmit={submitForm(submit)} aria-label="ขอลบบัญชี" className="max-w-[520px] space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="del-reason">เหตุผล (ไม่บังคับ)</Label>
        <textarea id="del-reason" name="reason" rows={3} maxLength={500} className={textareaClass} />
        {errors.reason ? <p className="text-destructive text-[12.5px]">{errors.reason}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="del-confirm">{hasPassword ? "ยืนยันด้วยรหัสผ่านปัจจุบัน" : "พิมพ์อีเมลของบัญชีนี้เพื่อยืนยัน"}</Label>
        <Input
          id="del-confirm"
          name="confirm"
          type={hasPassword ? "password" : "email"}
          autoComplete={hasPassword ? "current-password" : "off"}
          required
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "del-confirm-error" : undefined}
          className="h-11"
        />
        {errors.confirm ? (
          <p id="del-confirm-error" className="text-destructive text-[12.5px]">
            {errors.confirm}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="destructive" className="h-11" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
        ส่งคำขอลบบัญชี
      </Button>
    </form>
  );
}
