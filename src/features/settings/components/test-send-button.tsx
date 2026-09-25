"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestEmail, sendTestLine } from "@/features/settings/actions";

const ACTIONS = { email: sendTestEmail, line: sendTestLine } as const;

/** FR-17.3 — ปุ่ม "ส่งทดสอบ" ส่งหาผู้ดูแลที่กดเอง (อีเมลของบัญชี / LINE ที่ผูกไว้) */
export function TestSendButton({
  channel,
  label,
  disabled,
}: {
  channel: keyof typeof ACTIONS;
  label: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await ACTIONS[channel]();
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      {label}
    </Button>
  );
}
