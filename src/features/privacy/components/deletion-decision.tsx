"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approveAccountDeletion, rejectAccountDeletion } from "@/features/privacy/actions";
import type { ActionResult } from "@/lib/action-result";
import { submitForm } from "@/lib/form";

const textareaClass =
  "border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2 text-[14px] outline-none focus-visible:ring-2";

/**
 * FR-17.4 — ปุ่มอนุมัติ/ปฏิเสธคำขอลบบัญชี
 * อนุมัติแล้วย้อนไม่ได้ จึงต้องกดสองจังหวะ (ไม่ใช้ window.confirm — ดู CLAUDE.md เรื่อง dialog ของเบราว์เซอร์)
 */
export function DeletionDecision({ userId, name, self }: { userId: string; name: string; self: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<"idle" | "approve" | "reject">("idle");
  const [error, setError] = React.useState<string | null>(null);

  function run(action: (fd: FormData) => Promise<ActionResult>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        setMode("idle");
        router.refresh();
      } else {
        setError(result.fieldErrors?.reason ?? null);
        toast.error(result.message);
      }
    });
  }

  if (self) {
    return <p className="text-muted-foreground text-[12.5px]">คำขอของคุณเอง — ต้องให้ผู้ดูแลระบบคนอื่นพิจารณา</p>;
  }

  if (mode === "approve") {
    return (
      <form
        onSubmit={submitForm((fd) => run(approveAccountDeletion, fd))}
        aria-label={`ยืนยันอนุมัติคำขอของ ${name}`}
        className="bg-danger-bg text-danger-fg space-y-2 rounded-lg p-3 text-[12.5px]"
      >
        <input type="hidden" name="userId" value={userId} />
        <p>ข้อมูลที่ระบุตัวตนของ {name} จะถูกลบทันทีและกู้คืนไม่ได้</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="destructive" className="h-11" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            ยืนยันลบข้อมูล
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setMode("idle")} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
      </form>
    );
  }

  if (mode === "reject") {
    return (
      <form
        onSubmit={submitForm((fd) => run(rejectAccountDeletion, fd))}
        aria-label={`ปฏิเสธคำขอของ ${name}`}
        className="space-y-2"
      >
        <input type="hidden" name="userId" value={userId} />
        <div className="space-y-1">
          <Label htmlFor={`reject-${userId}`}>เหตุผลที่ปฏิเสธ (ผู้ใช้จะเห็น)</Label>
          <textarea
            id={`reject-${userId}`}
            name="reason"
            rows={2}
            maxLength={500}
            required
            className={textareaClass}
            aria-invalid={error ? true : undefined}
          />
          {error ? <p className="text-destructive text-[12.5px]">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            ส่งผลการปฏิเสธ
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setMode("idle")} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="destructive" className="h-11" onClick={() => setMode("approve")}>
        อนุมัติ
      </Button>
      <Button type="button" variant="outline" className="h-11" onClick={() => setMode("reject")}>
        ปฏิเสธ
      </Button>
    </div>
  );
}
