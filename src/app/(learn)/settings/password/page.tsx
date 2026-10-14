import type { Metadata } from "next";
import { PasswordForm } from "@/features/account/components/password-form";
import { hasPassword as getHasPassword } from "@/features/account/queries";

export const metadata: Metadata = { title: "รหัสผ่าน" };

/** M01 · FR-01.9 */
export default async function PasswordPage() {
  const hasPassword = await getHasPassword();

  return (
    <section className="bg-card border-border max-w-xl rounded-xl border p-5">
      <h2 className="mb-1.5 text-[15px] font-semibold">
        {hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
      </h2>
      <p className="text-muted-foreground mb-5 text-[13px] leading-relaxed">
        {hasPassword
          ? "กรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน แล้วกำหนดรหัสผ่านใหม่ความยาวอย่างน้อย 8 ตัวอักษร"
          : "บัญชีนี้เข้าสู่ระบบด้วย Google และยังไม่มีรหัสผ่าน ตั้งรหัสผ่านไว้เพื่อเข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้อีกทาง (ยังเข้าด้วย Google ได้เหมือนเดิม)"}
      </p>
      <PasswordForm hasPassword={hasPassword} />
    </section>
  );
}
