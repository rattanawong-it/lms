"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/features/auth/schemas";

/** M01 · FR-01.4 — ขอลิงก์ตั้งรหัสผ่านใหม่ (อายุ 1 ชั่วโมง) */
export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    // ไม่เปิดเผยว่าอีเมลมีอยู่ในระบบหรือไม่ (NFR-03 · ป้องกัน user enumeration)
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });
    setSent(true);
  }

  return (
    <div>
      <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">ลืมรหัสผ่าน</h1>
      <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.75]">
        กรอกอีเมลที่ลงทะเบียนไว้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ที่ใช้ได้ครั้งเดียว อายุ 1 ชั่วโมง
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field
          label="อีเมลที่ลงทะเบียน"
          type="email"
          autoComplete="email"
          placeholder="somchai.k@krirk.ac.th"
          icon={<Mail className="size-[17px]" />}
          error={errors.email?.message}
          {...register("email")}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold"
        >
          {isSubmitting ? <Loader2 className="size-[18px] animate-spin" /> : null}
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
      </form>

      {sent ? (
        <div className="bg-success-bg mt-[18px] flex gap-2.5 rounded-[10px] px-[15px] py-3.5">
          <Check className="text-success-fg mt-px size-[18px] shrink-0" />
          <div>
            <p className="text-success-fg text-[13px] font-semibold">ส่งลิงก์แล้ว</p>
            <p className="text-fg-2 mt-1 text-[12px] leading-[1.7]">
              หากมีบัญชีของ {getValues("email")} อยู่ในระบบ จะได้รับอีเมลภายใน 5 นาที
              หากไม่พบให้ตรวจในกล่องจดหมายขยะ
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-muted-foreground mt-6 text-center text-[13px]">
        <Link href="/login" className="text-primary font-medium hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
