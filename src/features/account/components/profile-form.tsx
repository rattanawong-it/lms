"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { updateProfile } from "@/features/account/actions";

/** M01 · FR-01.5 — ฟอร์มแก้ไขโปรไฟล์ */
export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; phone: string | null; externalId: string | null };
}) {
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await updateProfile(formData);
          if (result.ok) {
            setFieldErrors({});
            toast.success(result.message);
          } else {
            setFieldErrors(result.fieldErrors ?? {});
            toast.error(result.message);
          }
        })
      }
      className="space-y-[15px]"
    >
      <Field
        label="ชื่อ-นามสกุล"
        name="name"
        defaultValue={defaults.name}
        autoComplete="name"
        required
        error={fieldErrors.name}
      />
      <Field
        label="เบอร์โทรศัพท์"
        name="phone"
        type="tel"
        inputMode="numeric"
        defaultValue={defaults.phone ?? ""}
        autoComplete="tel"
        placeholder="0812345678"
        error={fieldErrors.phone}
      />
      <Field
        label="รหัสนักศึกษา / รหัสพนักงาน"
        name="externalId"
        defaultValue={defaults.externalId ?? ""}
        placeholder="เช่น 6512345678"
        hint="ใช้เชื่อมกับข้อมูลทะเบียนของคณะ ถ้าไม่มีให้เว้นว่าง"
        error={fieldErrors.externalId}
      />

      <Button type="submit" disabled={pending} className="h-11 rounded-[9px] px-6 font-semibold">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        บันทึกโปรไฟล์
      </Button>
    </form>
  );
}
