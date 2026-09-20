"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, PasswordField } from "@/components/shared/field";
import { GoogleButton } from "@/features/auth/components/google-button";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";
import { authErrorMessage } from "@/features/auth/lib/error-messages";

/** M01 · FR-01.1 + FR-01.2 — หน้าเข้าสู่ระบบ */
export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const rememberMe = watch("rememberMe");

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe,
    });

    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    router.push(next || "/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">เข้าสู่ระบบ</h1>
      <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.7]">
        เข้าสู่ระบบด้วยอีเมลสถาบัน หรือบัญชี Google ที่ผูกไว้
      </p>

      {formError ? (
        <div
          role="alert"
          className="bg-danger-bg mb-[18px] flex gap-2.5 rounded-[9px] px-3.5 py-3"
        >
          <AlertCircle className="text-danger-fg mt-px size-[17px] shrink-0" />
          <p className="text-danger-fg text-[13px] font-medium">{formError}</p>
        </div>
      ) : null}

      {googleEnabled ? (
        <>
          <div className="mb-5">
            <GoogleButton next={next} />
          </div>
          <div className="mb-5 flex items-center gap-3">
            <span className="bg-line h-px flex-1" />
            <span className="text-muted-foreground text-[11.5px]">หรือใช้อีเมลและรหัสผ่าน</span>
            <span className="bg-line h-px flex-1" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[15px]">
        <Field
          label="อีเมล"
          type="email"
          autoComplete="email"
          placeholder="somchai.k@krirk.ac.th"
          icon={<Mail className="size-[17px]" />}
          error={errors.email?.message}
          {...register("email")}
        />

        <PasswordField
          label="รหัสผ่าน"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          action={
            <Link
              href="/forgot-password"
              className="text-primary text-[12px] font-medium hover:underline"
            >
              ลืมรหัสผ่าน?
            </Link>
          }
          {...register("password")}
        />

        <div className="flex items-center gap-2.5 pt-1">
          <Checkbox
            id="rememberMe"
            checked={rememberMe}
            onCheckedChange={(v) => setValue("rememberMe", v === true)}
          />
          <Label htmlFor="rememberMe" className="text-fg-2 text-[13px] font-normal">
            จดจำการเข้าสู่ระบบบนอุปกรณ์นี้ 30 วัน
          </Label>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold"
        >
          {isSubmitting ? <Loader2 className="size-[18px] animate-spin" /> : null}
          เข้าสู่ระบบ
        </Button>
      </form>

      <p className="text-muted-foreground mt-4 text-center text-[13px]">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          สมัครสมาชิก
        </Link>
      </p>

      <p className="border-line text-muted-foreground mt-6 border-t pt-[18px] text-[11.5px] leading-[1.75]">
        การเข้าสู่ระบบทุกครั้งถูกบันทึกใน Audit Log พร้อม IP และอุปกรณ์ ตามข้อกำหนด PDPA
      </p>
    </div>
  );
}
