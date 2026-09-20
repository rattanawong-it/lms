import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNext } from "@/features/auth/lib/safe-next";
import { hasGoogleOAuth } from "@/lib/env";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  return <LoginForm next={safeNext(params.next)} googleEnabled={hasGoogleOAuth} />;
}
