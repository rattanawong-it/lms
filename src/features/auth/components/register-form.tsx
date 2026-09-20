"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, Mail, MailCheck, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, PasswordField } from "@/components/shared/field";
import { GoogleButton } from "@/features/auth/components/google-button";
import { PasswordStrength } from "@/features/auth/components/password-strength";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";
import { authErrorMessage } from "@/features/auth/lib/error-messages";

/** M01 · FR-01.1 · FR-01.3 · FR-01.8 — สมัครสมาชิก */
export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password") ?? "";
  const pdpaConsent = watch("pdpaConsent");

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL: "/dashboard",
    });

    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setSentTo(values.email);
  }

  // FR-01.3 — หลังสมัครต้องยืนยันอีเมลก่อนเข้าใช้งาน
  if (sentTo) {
    return (
      <div>
        <div className="bg-accent text-primary mb-[18px] flex size-[46px] items-center justify-center rounded-xl">
          <MailCheck className="size-[23px]" />
        </div>
        <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">ยืนยันอีเมลของคุณ</h1>
        <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.75]">
          เราส่งลิงก์ยืนยันไปที่ <span className="text-foreground font-medium">{sentTo}</span>{" "}
          กรุณากดลิงก์ในอีเมลเพื่อเปิดใช้งานบัญชี ลิงก์มีอายุ 1 ชั่วโมง
        </p>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-[9px] text-[13.5px] font-medium"
          onClick={async () => {
            await authClient.sendVerificationEmail({ email: sentTo, callbackURL: "/dashboard" });
          }}
        >
          ส่งลิงก์ยืนยันอีกครั้ง
        </Button>

        <p className="text-muted-foreground mt-5 text-[12.5px] leading-[1.75]">
          ไม่ได้รับอีเมล? ตรวจในกล่องจดหมายขยะ หรือ{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">สมัครสมาชิก</h1>
      <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.7]">
        สมัครด้วยอีเมล ยืนยันอีเมลก่อนใช้งาน และต้องให้ความยินยอมตาม PDPA
      </p>

      {formError ? (
        <div role="alert" className="bg-danger-bg mb-[18px] flex gap-2.5 rounded-[9px] px-3.5 py-3">
          <AlertCircle className="text-danger-fg mt-px size-[17px] shrink-0" />
          <p className="text-danger-fg text-[13px] font-medium">{formError}</p>
        </div>
      ) : null}

      {googleEnabled ? (
        <>
          <div className="mb-5">
            <GoogleButton />
          </div>
          <div className="mb-5 flex items-center gap-3">
            <span className="bg-line h-px flex-1" />
            <span className="text-muted-foreground text-[11.5px]">หรือสมัครด้วยอีเมล</span>
            <span className="bg-line h-px flex-1" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[15px]">
        <Field
          label="ชื่อ-นามสกุล"
          autoComplete="name"
          placeholder="สมชาย เกริกไกร"
          icon={<User className="size-[17px]" />}
          error={errors.name?.message}
          {...register("name")}
        />

        <Field
          label="อีเมล"
          type="email"
          autoComplete="email"
          placeholder="somchai.k@krirk.ac.th"
          icon={<Mail className="size-[17px]" />}
          hint="นักศึกษาและบุคลากรแนะนำให้ใช้อีเมล @krirk.ac.th"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="space-y-2.5">
          <PasswordField
            label="รหัสผ่าน"
            autoComplete="new-password"
            placeholder="อย่างน้อย 8 ตัวอักษร"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrength value={password} />
        </div>

        <PasswordField
          label="ยืนยันรหัสผ่าน"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <div className="bg-background border-line rounded-[10px] border p-[15px]">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="pdpaConsent"
              className="mt-0.5"
              checked={pdpaConsent === true}
              onCheckedChange={(v) =>
                setValue("pdpaConsent", v === true ? true : (undefined as never), {
                  shouldValidate: true,
                })
              }
              aria-invalid={Boolean(errors.pdpaConsent) || undefined}
            />
            <Label
              htmlFor="pdpaConsent"
              className="text-fg-2 block text-[12.5px] leading-[1.7] font-normal"
            >
              ข้าพเจ้ายอมรับ{" "}
              <Link href="/privacy" className="text-primary font-medium hover:underline">
                นโยบายความเป็นส่วนตัว
              </Link>{" "}
              และยินยอมให้มหาวิทยาลัยเกริกเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล
              เพื่อวัตถุประสงค์ในการจัดการเรียนการสอน ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล
            </Label>
          </div>
          {errors.pdpaConsent ? (
            <p role="alert" className="text-danger-fg mt-2 text-[12px] font-medium">
              {errors.pdpaConsent.message}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold"
        >
          {isSubmitting ? <Loader2 className="size-[18px] animate-spin" /> : null}
          สร้างบัญชีและส่งลิงก์ยืนยัน
        </Button>
      </form>

      <p className="text-muted-foreground mt-4 text-center text-[13px]">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
