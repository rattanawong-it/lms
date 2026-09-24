"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { submitForm } from "@/lib/form";
import type { ActionResult } from "@/lib/action-result";
import {
  NOTIFY_CHANNEL_LABEL,
  NOTIFY_CHANNELS,
  NOTIFY_TYPE_LABEL,
  NOTIFY_TYPES,
  prefFieldName,
  type NotifyChannel,
  type NotifyPrefs,
} from "@/lib/notify/prefs";

const LINE_NOTE = {
  disabled: "ระบบยังไม่เปิดใช้การแจ้งเตือนทาง LINE",
  unlinked: "เชื่อมต่อบัญชี LINE ก่อนจึงจะเลือกช่องทางนี้ได้",
  linked: null,
} as const;

/**
 * FR-11.4 — ตั้งค่าว่าจะรับการแจ้งเตือนชนิดใดทางช่องทางใด
 * การแจ้งเตือนในแอปเปิดเสมอ · แต่ละชนิดเป็นแถวที่ขึ้นบรรทัดใหม่เองบนจอเล็ก (ไม่ใช้ตารางกว้าง — CLAUDE.md §6)
 */
export function NotifyPrefsForm({
  prefs,
  email,
  editable,
  line,
  save,
}: {
  prefs: NotifyPrefs;
  email: string;
  editable: NotifyChannel[];
  line: keyof typeof LINE_NOTE;
  save: (formData: FormData) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await save(formData);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <form onSubmit={submitForm(submit)} className="max-w-[720px] space-y-4">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        การแจ้งเตือนทุกชนิดแสดงที่กระดิ่งในแอปเสมอ · เลือกเพิ่มได้ว่าจะให้ส่งทางอีเมล (
        <span className="text-foreground font-medium break-all">{email}</span>) หรือ LINE ด้วยหรือไม่
      </p>
      {LINE_NOTE[line] ? (
        <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-[12.5px]">
          {LINE_NOTE[line]}
          {line === "unlinked" ? (
            <>
              {" "}·{" "}
              <Link href="/settings/line" className="text-primary underline underline-offset-2">
                เชื่อมต่อ LINE
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <ul className="border-border bg-card divide-border divide-y rounded-xl border">
        {NOTIFY_TYPES.map((type) => {
          const { label, hint } = NOTIFY_TYPE_LABEL[type];
          return (
            <li key={type} data-notify-type={type} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-[14px] font-medium">{label}</p>
                <p className="text-muted-foreground text-[12.5px]">{hint}</p>
              </div>
              <div className="flex gap-1">
                {NOTIFY_CHANNELS.map((channel) => {
                  const id = `pref-${type}-${channel}`;
                  const disabled = !editable.includes(channel);
                  return (
                    <label
                      key={channel}
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] has-disabled:cursor-not-allowed has-disabled:opacity-50"
                    >
                      <Checkbox
                        id={id}
                        name={prefFieldName(type, channel)}
                        defaultChecked={prefs[type][channel]}
                        disabled={disabled}
                        aria-label={`${label} ทาง${NOTIFY_CHANNEL_LABEL[channel]}`}
                      />
                      {NOTIFY_CHANNEL_LABEL[channel]}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกการตั้งค่า
        </Button>
      </div>
    </form>
  );
}
