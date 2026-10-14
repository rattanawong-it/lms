"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/shared/field";
import { PasswordStrength } from "@/features/auth/components/password-strength";
import { changePassword, setPassword } from "@/features/account/actions";
import { submitForm } from "@/lib/form";

/**
 * M01 · FR-01.9 — เปลี่ยนรหัสผ่าน / ตั้งรหัสผ่านครั้งแรก (บัญชีที่เข้าด้วย Google อย่างเดียว)
 * `hasPassword` มาจาก server — ไม่มีรหัสเดิมก็ไม่แสดงช่องรหัสผ่านปัจจุบัน
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [password, setPasswordValue] = React.useState("");
  // เปลี่ยน key เพื่อล้างช่องรหัสผ่านทั้งหมดหลังบันทึกสำเร็จ (ไม่เก็บรหัสค้างไว้ในหน้า)
  const [formKey, setFormKey] = React.useState(0);

  return (
    <form
      key={formKey}
      onSubmit={submitForm((formData) =>
        startTransition(async () => {
          const result = await (hasPassword ? changePassword(formData) : setPassword(formData));
          if (result.ok) {
            setFieldErrors({});
            setPasswordValue("");
            setFormKey((k) => k + 1);
            toast.success(result.message);
          } else {
            setFieldErrors(result.fieldErrors ?? {});
            toast.error(result.message);
          }
        }),
      )}
      noValidate
      className="space-y-[15px]"
    >
      {hasPassword ? (
        <PasswordField
          label="รหัสผ่านปัจจุบัน"
          name="currentPassword"
          autoComplete="current-password"
          required
          error={fieldErrors.currentPassword}
        />
      ) : null}

      <div className="space-y-2.5">
        <PasswordField
          label="รหัสผ่านใหม่"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPasswordValue(e.currentTarget.value)}
          error={fieldErrors.password}
        />
        <PasswordStrength value={password} />
      </div>

      <PasswordField
        label="ยืนยันรหัสผ่านใหม่"
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword}
      />

      <div className="flex min-h-11 items-center gap-2.5">
        <Checkbox id="revoke-other-sessions" name="revokeOtherSessions" defaultChecked />
        <Label htmlFor="revoke-other-sessions" className="text-[13px] leading-relaxed font-normal">
          ออกจากระบบบนอุปกรณ์อื่นทั้งหมด (เครื่องนี้ยังเข้าสู่ระบบอยู่)
        </Label>
      </div>

      <Button type="submit" disabled={pending} className="h-11 rounded-[9px] px-6 font-semibold">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
      </Button>
    </form>
  );
}
