"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, MailCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";

/**
 * M01 · FR-01.3 — หน้าจอสถานะการยืนยันอีเมล (ออกแบบเสริมจากชุด UI เดิม
 * ซึ่งออกแบบไว้เป็นช่องกรอก OTP แต่ spec กำหนดให้ยืนยันด้วยลิงก์ในอีเมล)
 */
export function VerifyEmailPanel({ status }: { status: "pending" | "invalid" }) {
  const [email, setEmail] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const invalid = status === "invalid";

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: "/dashboard" });
    setSending(false);
    toast.success("ส่งลิงก์ยืนยันแล้ว หากอีเมลนี้มีอยู่ในระบบจะได้รับภายใน 5 นาที");
  }

  return (
    <div>
      <div
        className={
          invalid
            ? "bg-warning-bg text-warning-fg mb-[18px] flex size-[46px] items-center justify-center rounded-xl"
            : "bg-accent text-primary mb-[18px] flex size-[46px] items-center justify-center rounded-xl"
        }
      >
        {invalid ? <MailWarning className="size-[23px]" /> : <MailCheck className="size-[23px]" />}
      </div>

      <h1 className="mb-[7px] text-[27px] font-bold tracking-[-0.018em]">
        {invalid ? "ลิงก์ยืนยันใช้ไม่ได้" : "ยืนยันอีเมลของคุณ"}
      </h1>
      <p className="text-muted-foreground mb-6 text-[13.5px] leading-[1.75]">
        {invalid
          ? "ลิงก์ยืนยันอีเมลไม่ถูกต้องหรือหมดอายุแล้ว (ลิงก์มีอายุ 1 ชั่วโมง) กรอกอีเมลด้านล่างเพื่อขอลิงก์ใหม่"
          : "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลที่เราส่งให้ หรือขอลิงก์ใหม่ด้านล่าง"}
      </p>

      <form onSubmit={resend} className="space-y-5">
        <Field
          label="อีเมลที่ใช้สมัคร"
          type="email"
          autoComplete="email"
          placeholder="somchai.k@krirk.ac.th"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="submit"
          disabled={sending}
          className="h-11 w-full rounded-[9px] text-[14.5px] font-semibold"
        >
          {sending ? <Loader2 className="size-[18px] animate-spin" /> : null}
          ส่งลิงก์ยืนยันอีกครั้ง
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-[13px]">
        <Link href="/login" className="text-primary font-medium hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
