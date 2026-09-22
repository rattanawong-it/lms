"use client";

import * as React from "react";
import { Expand, Minimize } from "lucide-react";
import { Watermark } from "@/components/protected-viewer/watermark";
import { useScreenGuard } from "@/components/protected-viewer/use-screen-guard";
import { cn } from "@/lib/utils";

/**
 * M15 — กล่องครอบเนื้อหาบทเรียนทุกชนิด (system-design §6.2)
 *
 * รวมชั้นที่ 2–4 ของแผนป้องกันไว้ที่เดียว: ปิดการเลือก/คัดลอก/ลาก/คลิกขวา,
 * เบลอเมื่อเสียโฟกัสหรือน่าจะมี DevTools, ลายน้ำที่สร้างกลับเมื่อถูกลบ และรายงานเหตุการณ์
 *
 * **สิ่งที่กล่องนี้ทำไม่ได้** (ยืนยันกับเจ้าของระบบแล้ว · spec §M15): กันการจับภาพระดับ
 * ระบบปฏิบัติการ การอัดหน้าจอ และการถ่ายด้วยกล้อง ต้องใช้ DRM ซึ่งเป็นงานของเฟสถัดไป
 */
export function ProtectedViewer({
  enabled,
  watermark,
  lessonId,
  allowFullscreen = false,
  children,
}: {
  /** FR-15.9 — ปิดได้ทั้งระดับระบบและระดับคอร์ส */
  enabled: boolean;
  watermark: { name: string; id: string };
  lessonId: string | null;
  /** วิดีโอต้องขยายเต็มจอที่ "กล่องนี้" ไม่ใช่ที่ `<video>` ไม่งั้นลายน้ำจะหลุดออกนอกจอ */
  allowFullscreen?: boolean;
  children: React.ReactNode;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const watermarkRef = React.useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const onHide = React.useCallback((next: boolean) => setHidden(next), []);
  useScreenGuard({ enabled, lessonId, onHide });

  /**
   * FR-15.5 — ลายน้ำถูกลบทิ้งได้ง่ายมากจาก DevTools ด้วยคำสั่งบรรทัดเดียว
   * `MutationObserver` จึงคอยดูว่ายังอยู่ไหม แล้วเอากลับเข้าที่ทันทีที่หาย
   *
   * **เอา node เดิมกลับเข้าไป ไม่ใช่สั่ง React สร้างใหม่** — ถ้าให้ React remount
   * มันจะไปเรียก `removeChild` กับ node ที่ไม่มีพ่อแม่แล้วจน throw และทำให้
   * ทั้งกล่องนี้หลุดออกจากหน้าจอ ซึ่งกลายเป็นช่วยคนที่พยายามลบลายน้ำเสียเอง
   */
  React.useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      const node = watermarkRef.current;
      if (node && !container.contains(node)) container.appendChild(node);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled]);

  React.useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await container.requestFullscreen().catch(() => undefined);
    }
  }

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      data-protected=""
      // FR-15.1 — ปิดการเลือกข้อความและการลากรูปออกไปนอกหน้า
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "relative select-none [&_img]:pointer-events-none",
        fullscreen && "bg-background flex items-center justify-center",
      )}
    >
      <div
        className={cn(
          "transition-[filter,opacity] duration-150",
          // FR-15.3 — เบลอทันทีเมื่อหน้าต่างเสียโฟกัส สลับแอป หรือน่าจะเปิด DevTools
          hidden && "pointer-events-none blur-xl opacity-40",
          fullscreen && "w-full",
        )}
      >
        {children}
      </div>

      <Watermark ref={watermarkRef} name={watermark.name} id={watermark.id} />

      {hidden ? (
        <p
          role="status"
          className="bg-foreground/85 absolute inset-0 z-20 flex items-center justify-center px-6 text-center text-[13px] font-medium text-white"
        >
          เนื้อหาถูกซ่อนไว้ชั่วคราว กลับมาที่หน้านี้เพื่อดูต่อ
        </p>
      ) : null}

      {allowFullscreen ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? "ออกจากโหมดเต็มจอ" : "ดูแบบเต็มจอ"}
          className="bg-foreground/60 hover:bg-foreground/80 focus-visible:ring-ring absolute top-2 right-2 z-20 flex size-9 items-center justify-center rounded-lg text-white focus-visible:ring-2 focus-visible:outline-none"
        >
          {fullscreen ? <Minimize className="size-4" /> : <Expand className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}
