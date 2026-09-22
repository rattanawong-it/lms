"use client";

import * as React from "react";
import {
  WATERMARK_SHIFT_MAX_MS,
  WATERMARK_SHIFT_MIN_MS,
} from "@/features/protection/schemas";
import { formatDateTime } from "@/lib/dates";

/**
 * M15 · FR-15.5 — ลายน้ำที่บอกว่า "ใครเป็นคนเปิดดูหน้านี้อยู่"
 *
 * จุดประสงค์คือ **ตามรอยผู้ปล่อยข้อมูล** ไม่ใช่กันการถ่ายภาพ (กันไม่ได้อยู่แล้วบนเว็บ)
 * ภาพที่หลุดออกไปจะมีชื่อ อีเมล และเวลาติดไปด้วยเสมอ
 *
 * ทับด้วย `pointer-events: none` เพื่อไม่ให้บังการกดปุ่มของตัวเล่นวิดีโอข้างใต้
 */
const ROWS = 4;
const COLUMNS = 3;

function randomOffset() {
  return {
    x: Math.round(Math.random() * 12 - 6),
    y: Math.round(Math.random() * 12 - 6),
  };
}

export function Watermark({
  name,
  id,
  ref,
}: {
  name: string;
  id: string;
  /** `<ProtectedViewer>` ถือ ref ไว้เพื่อเอา node กลับเข้า DOM เมื่อถูกลบ */
  ref?: React.Ref<HTMLDivElement>;
}) {
  const [offset, setOffset] = React.useState(() => ({ x: 0, y: 0 }));
  const [stamp, setStamp] = React.useState(() => new Date());

  // FR-15.5 — ขยับตำแหน่งใหม่ทุก 20–30 วินาที ให้การลบลายน้ำออกจากภาพทำได้ยากขึ้น
  React.useEffect(() => {
    let timer: number;

    const schedule = () => {
      const delay =
        WATERMARK_SHIFT_MIN_MS +
        Math.random() * (WATERMARK_SHIFT_MAX_MS - WATERMARK_SHIFT_MIN_MS);
      timer = window.setTimeout(() => {
        setOffset(randomOffset());
        setStamp(new Date());
        schedule();
      }, delay);
    };

    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const label = `${name} · ${id} · ${formatDateTime(stamp)}`;

  return (
    <div
      ref={ref}
      data-watermark=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <div className="grid h-full w-full" style={{ gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
        {Array.from({ length: ROWS }).map((_, row) => (
          <div
            key={row}
            className="grid items-center"
            style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}
          >
            {Array.from({ length: COLUMNS }).map((_, column) => (
              <span
                key={column}
                className="num text-foreground/[0.14] truncate text-center text-[11px] font-medium whitespace-nowrap"
                style={{ transform: "rotate(-25deg)" }}
              >
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
