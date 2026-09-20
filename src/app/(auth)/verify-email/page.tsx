import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";

export const metadata: Metadata = { title: "ยืนยันอีเมล" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const status = params.error ? "invalid" : "pending";

  return <VerifyEmailPanel status={status} />;
}
