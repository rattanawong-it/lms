"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssetField, type AssetValue } from "@/features/uploads/components/asset-field";
import { saveBranding } from "@/features/settings/actions";
import { AssetKind } from "@/generated/prisma/enums";
import { submitForm } from "@/lib/form";

/** FR-17.3 — ชื่อระบบและโลโก้ที่แสดงบนหัวเว็บทุกหน้า */
export function BrandingForm({ name, logo }: { name: string; logo: AssetValue | null }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveBranding(formData);
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
    <form onSubmit={submitForm(submit)} aria-label="ชื่อระบบและโลโก้" className="space-y-4">
      <div className="max-w-[420px] space-y-1.5">
        <Label htmlFor="brand-name">ชื่อระบบ</Label>
        <Input
          id="brand-name"
          name="name"
          defaultValue={name}
          maxLength={40}
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "brand-name-error" : undefined}
          className="h-11"
        />
        {errors.name ? (
          <p id="brand-name-error" className="text-destructive text-[12.5px]">
            {errors.name}
          </p>
        ) : null}
      </div>

      <AssetField
        label="โลโก้ (ไม่บังคับ)"
        name="logoAssetId"
        kind={AssetKind.IMAGE}
        hint="รูปสี่เหลี่ยมจัตุรัส พื้นโปร่งใส อย่างน้อย 128×128 px · ไม่ใส่ = ใช้ไอคอนหมวกบัณฑิต"
        error={errors.logoAssetId}
        defaultValue={logo}
        className="max-w-[420px]"
      />

      <Button type="submit" disabled={pending} className="h-11">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        บันทึก
      </Button>
    </form>
  );
}
