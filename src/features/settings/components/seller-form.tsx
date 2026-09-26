"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { saveSeller } from "@/features/settings/actions";
import type { Seller } from "@/features/settings/schemas";
import { submitForm } from "@/lib/form";

/** M18 · FR-18.2 — ผู้ขายที่พิมพ์บนใบเสร็จ · มีผลกับใบที่ออกหลังบันทึกเท่านั้น (ใบเดิมเก็บ snapshot ไว้) */
export function SellerForm({ seller }: { seller: Seller }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const addressId = React.useId();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveSeller(formData);
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submitForm(submit)} aria-label="ข้อมูลผู้ขายบนใบเสร็จ" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <Field label="ชื่อผู้ขาย / นิติบุคคล" name="name" defaultValue={seller.name} maxLength={150} required error={errors.name} />
      </div>
      <div className="min-w-0">
        <Field
          label="เลขประจำตัวผู้เสียภาษี (ไม่บังคับ)"
          name="taxId"
          defaultValue={seller.taxId ?? ""}
          inputMode="numeric"
          maxLength={17}
          hint="ตัวเลข 13 หลัก"
          error={errors.taxId}
        />
      </div>
      <div className="min-w-0">
        <Field label="โทรศัพท์ (ไม่บังคับ)" name="phone" defaultValue={seller.phone ?? ""} maxLength={40} error={errors.phone} />
      </div>
      <div className="min-w-0 space-y-[7px] sm:col-span-2">
        <Label htmlFor={addressId} className="text-[12.5px] font-medium">
          ที่อยู่ (ไม่บังคับ)
        </Label>
        <textarea
          id={addressId}
          name="address"
          rows={2}
          maxLength={300}
          defaultValue={seller.address ?? ""}
          aria-invalid={Boolean(errors.address) || undefined}
          className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2"
        />
        {errors.address ? (
          <p role="alert" className="text-danger-fg text-[12px] font-medium">
            {errors.address}
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกข้อมูลผู้ขาย
        </Button>
      </div>
    </form>
  );
}
