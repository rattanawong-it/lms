"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { submitForm } from "@/lib/form";
import { createCoupon, setCouponActive } from "@/features/commerce/actions";

const selectClass =
  "border-input bg-card focus-visible:ring-ring h-11 w-full rounded-[9px] border px-3 text-[14px] outline-none focus-visible:ring-2";

/** FR-18.2 — สร้างคูปอง (`/admin/coupons`) · ข้อผิดพลาดแสดงใต้ช่อง ค่าที่กรอกไม่หาย */
export function CouponForm({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  // สร้างสำเร็จ → เปลี่ยน key ให้ฟอร์มเริ่มใหม่ (ไม่สำเร็จ ค่าที่กรอกคงอยู่)
  const [formKey, setFormKey] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [kind, setKind] = React.useState<"percent" | "amount">("percent");
  const kindId = React.useId();
  const courseId = React.useId();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createCoupon(formData);
      if (result.ok) {
        toast.success(result.message);
        setErrors({});
        setFormKey((k) => k + 1);
        setKind("percent");
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <form
      key={formKey}
      onSubmit={submitForm(submit)}
      aria-label="สร้างคูปอง"
      className="bg-card border-border grid grid-cols-1 gap-4 rounded-xl border p-5 sm:grid-cols-2"
    >
      <div className="min-w-0">
        <Field
          label="รหัสคูปอง"
          name="code"
          required
          maxLength={32}
          autoComplete="off"
          hint="A–Z, 0–9, - หรือ _ · ไม่สนตัวพิมพ์เล็ก/ใหญ่"
          error={errors.code}
        />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="space-y-[7px]">
          <Label htmlFor={kindId} className="text-[12.5px] font-medium">
            ชนิดส่วนลด
          </Label>
          <select
            id={kindId}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value === "amount" ? "amount" : "percent")}
            className={selectClass}
          >
            <option value="percent">เปอร์เซ็นต์ (%)</option>
            <option value="amount">จำนวนเงิน (บาท)</option>
          </select>
        </div>
        <Field
          label={kind === "percent" ? "ลด (%)" : "ลด (บาท)"}
          name="value"
          inputMode="decimal"
          required
          error={errors.value}
        />
      </div>
      <div className="min-w-0 space-y-[7px]">
        <Label htmlFor={courseId} className="text-[12.5px] font-medium">
          ใช้กับ
        </Label>
        <select id={courseId} name="courseId" defaultValue="" className={selectClass} aria-invalid={Boolean(errors.courseId) || undefined}>
          <option value="">ทุกคอร์สที่มีราคา</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {errors.courseId ? (
          <p role="alert" className="text-danger-fg text-[12px] font-medium">
            {errors.courseId}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <Field
          label="จำกัดจำนวนครั้ง"
          name="maxUses"
          type="number"
          min={1}
          step={1}
          hint="เว้นว่าง = ไม่จำกัด"
          error={errors.maxUses}
        />
      </div>
      <div className="min-w-0">
        <Field label="เริ่มใช้ได้ (เวลาไทย)" name="validFrom" type="datetime-local" hint="เว้นว่าง = ทันที" error={errors.validFrom} />
      </div>
      <div className="min-w-0">
        <Field
          label="หมดอายุ (เวลาไทย)"
          name="validUntil"
          type="datetime-local"
          hint="เว้นว่าง = ไม่หมดอายุ"
          error={errors.validUntil}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          สร้างคูปอง
        </Button>
      </div>
    </form>
  );
}

/** FR-18.2 — เปิด/ปิดใช้คูปอง (ไม่มีการลบ — คำสั่งซื้อเก่าอ้างถึงอยู่) */
export function CouponToggle({ couponId, code, active }: { couponId: string; code: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setCouponActive(formData);
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
      <input type="hidden" name="couponId" value={couponId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" size="sm" variant="outline" className="min-h-11" disabled={pending} aria-label={`${active ? "ปิดใช้" : "เปิดใช้"}คูปอง ${code}`}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {active ? "ปิดใช้" : "เปิดใช้"}
      </Button>
    </form>
  );
}
