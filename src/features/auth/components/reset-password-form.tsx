"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/shared/field";
import { PasswordStrength } from "@/features/auth/components/password-strength";
import { resetPasswordSchema, type ResetPasswordInput } from "@/features/auth/schemas";
import { authErrorMessage } from "@/features/auth/lib/error-messages";

/** M01 · FR-01.4 — ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? "", password: "", confirmPassword: "" },
  });

  const password = watch("password") ?? "";

  if (!token) {
    return (
      <div>
        <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">ลิงก์ไม่ถูกต้อง</h1>
        <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.75]">
          ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง
        </p>
        <Button asChild className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold">
          <Link href="/forgot-password">ขอลิงก์ใหม่</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token: values.token,
    });

    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    toast.success("ตั้งรหัสผ่านใหม่เรียบร้อย กรุณาเข้าสู่ระบบอีกครั้ง");
    router.push("/login");
  }

  return (
    <div>
      <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">ตั้งรหัสผ่านใหม่</h1>
      <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.75]">
        กำหนดรหัสผ่านใหม่ความยาวอย่างน้อย 8 ตัวอักษร แนะนำให้ผ่านเกณฑ์ความปลอดภัยครบทุกข้อ
      </p>

      {formError ? (
        <div role="alert" className="bg-danger-bg mb-[18px] flex gap-2.5 rounded-[9px] px-3.5 py-3">
          <AlertCircle className="text-danger-fg mt-px size-[17px] shrink-0" />
          <p className="text-danger-fg text-[13px] font-medium">{formError}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[15px]">
        <input type="hidden" {...register("token")} />

        <div className="space-y-2.5">
          <PasswordField
            label="รหัสผ่านใหม่"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrength value={password} />
        </div>

        <PasswordField
          label="ยืนยันรหัสผ่านใหม่"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold"
        >
          {isSubmitting ? <Loader2 className="size-[18px] animate-spin" /> : null}
          บันทึกรหัสผ่านใหม่
        </Button>
      </form>
    </div>
  );
}
