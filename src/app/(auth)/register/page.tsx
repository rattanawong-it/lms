import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/components/register-form";
import { hasGoogleOAuth } from "@/lib/env";

export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default function RegisterPage() {
  return <RegisterForm googleEnabled={hasGoogleOAuth} />;
}
