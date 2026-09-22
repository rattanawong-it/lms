"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSystemProtection } from "@/features/protection/actions";
import { submitForm } from "@/lib/form";

/**
 * M15 · FR-15.9 — สวิตช์การป้องกันระดับระบบ
 *
 * ตั้งใจให้เป็นปุ่มที่ต้องกดอย่างรู้ตัว ไม่ใช่ checkbox ที่เผลอติ๊ก
 * เพราะการปิดมีผลกับผู้เรียนทุกคนทุกคอร์สทันที
 */
export function ProtectionSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setSystemProtection(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <section
      aria-labelledby="protection-switch"
      className="bg-card border-border rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="protection-switch" className="flex items-center gap-2 text-[15px] font-semibold">
            {enabled ? (
              <ShieldCheck className="text-success-fg size-[18px]" />
            ) : (
              <ShieldOff className="text-danger-fg size-[18px]" />
            )}
            การป้องกันเนื้อหาระดับระบบ
          </h2>
          <p className="text-muted-foreground mt-1.5 max-w-[640px] text-[12.5px] leading-relaxed">
            {enabled
              ? "เปิดอยู่ — บทเรียนจะมีลายน้ำ ปิดคลิกขวา/คัดลอก เบลอเมื่อสลับหน้าต่าง และสั่งพิมพ์ไม่ได้ โดยคอร์สที่ปิดสวิตช์ของตัวเองไว้จะไม่ถูกป้องกัน"
              : "ปิดอยู่ — ทุกคอร์สไม่ถูกป้องกัน แม้คอร์สนั้นจะเปิดสวิตช์ของตัวเองไว้ก็ตาม"}
          </p>
        </div>

        <form onSubmit={submitForm(submit)} className="shrink-0">
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <Button type="submit" variant={enabled ? "outline" : "default"} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {enabled ? "ปิดการป้องกันทั้งระบบ" : "เปิดการป้องกันทั้งระบบ"}
          </Button>
        </form>
      </div>
    </section>
  );
}
