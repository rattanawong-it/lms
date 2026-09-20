"use client";

import * as React from "react";
import { Loader2, LogOut, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokeOtherSessions, revokeSession } from "@/features/account/actions";
import type { DeviceSession } from "@/features/account/queries";
import { formatDateTime } from "@/lib/dates";

/** M01 · FR-01.6 — รายการอุปกรณ์ที่เข้าสู่ระบบอยู่ และปุ่มยกเลิก */
export function SessionList({
  sessions,
  describe,
}: {
  sessions: DeviceSession[];
  describe: Record<string, string>;
}) {
  const [pending, startTransition] = React.useTransition();
  const otherCount = sessions.filter((s) => !s.current).length;

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {otherCount > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => revokeOtherSessions())}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            ออกจากระบบอุปกรณ์อื่นทั้งหมด ({otherCount})
          </Button>
        </div>
      ) : null}

      <ul className="space-y-3">
        {sessions.map((session) => (
          <li
            key={session.token}
            className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-muted text-fg-3 flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Monitor className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                  {describe[session.token] ?? "อุปกรณ์ไม่ระบุ"}
                  {session.current ? (
                    <Badge variant="secondary" className="bg-success-bg text-success-fg">
                      อุปกรณ์นี้
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground mt-1 text-[11.5px] leading-relaxed">
                  เข้าสู่ระบบ {formatDateTime(session.createdAt)}
                  {session.ipAddress ? ` · IP ${session.ipAddress}` : ""}
                </p>
                <p className="text-muted-foreground text-[11.5px]">
                  หมดอายุ {formatDateTime(session.expiresAt)}
                </p>
              </div>
            </div>

            {!session.current ? (
              <form
                action={(formData) =>
                  startTransition(async () => {
                    const result = await revokeSession(formData);
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                  })
                }
                className="shrink-0"
              >
                <input type="hidden" name="token" value={session.token} />
                <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                  ยกเลิกอุปกรณ์นี้
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
