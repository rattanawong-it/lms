"use client";

import * as React from "react";
import { CalendarClock, ExternalLink, Radio, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { liveWindow, LIVE_OPEN_BEFORE_MIN } from "@/features/lesson-media/lib/embed";
import { formatDateTime } from "@/lib/dates";

/**
 * M05 · FR-05.5 — คาบเรียนสด
 *
 * ต้องเป็น client component เพราะปุ่มเปิดตามเวลาจริง ถ้าคำนวณฝั่ง server
 * ผู้เรียนที่เปิดหน้ารอไว้ก่อนเวลาจะเห็นปุ่มปิดค้างจนกว่าจะรีโหลดเอง
 */
export function LivePanel({
  liveUrl,
  liveStartAt,
  liveEndAt,
  recordingUrl,
}: {
  liveUrl: string | null;
  liveStartAt: Date | null;
  liveEndAt: Date | null;
  recordingUrl: string | null;
}) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const phase = liveWindow(liveStartAt, liveEndAt, now);

  return (
    <div className="bg-card border-border space-y-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Radio className="size-4" /> คาบเรียนสด
      </p>

      {liveStartAt ? (
        <p className="text-muted-foreground num flex items-center gap-2 text-[13px]">
          <CalendarClock className="size-4 shrink-0" />
          {formatDateTime(liveStartAt)}
          {liveEndAt ? ` – ${formatDateTime(liveEndAt)}` : ""}
        </p>
      ) : null}

      {phase === "before" ? (
        <>
          <Button disabled className="w-full sm:w-auto">
            ยังไม่ถึงเวลาเข้าห้อง
          </Button>
          <p className="text-muted-foreground text-[12px]">
            ปุ่มจะเปิดให้กดก่อนเวลาเริ่ม {LIVE_OPEN_BEFORE_MIN} นาที
          </p>
        </>
      ) : null}

      {phase === "open" && liveUrl ? (
        <Button asChild className="w-full sm:w-auto">
          <a href={liveUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> เข้าห้องเรียนสด
          </a>
        </Button>
      ) : null}

      {phase === "ended" ? (
        <p className="text-muted-foreground text-[12.5px]">คาบเรียนนี้จบไปแล้ว</p>
      ) : null}

      {recordingUrl ? (
        <div className="border-line border-t pt-3">
          <Button asChild variant="outline" size="sm">
            <a href={recordingUrl} target="_blank" rel="noopener noreferrer">
              <Video className="size-4" /> ดูวิดีโอบันทึกย้อนหลัง
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
