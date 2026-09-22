"use client";

import * as React from "react";
import { ScreenEvent } from "@/generated/prisma/enums";
import {
  EVENT_FLUSH_MS,
  MAX_EVENTS_PER_BATCH,
  type ScreenEventInput,
} from "@/features/protection/schemas";

/**
 * M15 ชั้นที่ 3 — ดักพฤติกรรมที่ส่อว่ากำลังคัดลอกเนื้อหา แล้วรายงานเป็นชุด
 *
 * **สิ่งที่ทำได้จริงบนเว็บ** (spec §M15 ระบุข้อจำกัดนี้ไว้ชัดแล้ว): เบราว์เซอร์กัน
 * การจับภาพระดับ OS ไม่ได้ · PrintScreen บน Windows ส่ง keyup ให้บ้างแต่ไม่เสมอ ·
 * Win+Shift+S ไม่ส่ง event ให้เลยเพราะระบบปฏิบัติการดักไปก่อน · บนมือถือไม่มี event ใด ๆ
 * สิ่งที่ยังทำได้คือ **ยับยั้ง** และ **บันทึกไว้ว่าใครพยายามเมื่อไร** คู่กับลายน้ำ
 */
export type ScreenGuardOptions = {
  enabled: boolean;
  lessonId: string | null;
  /**
   * ซ่อน/เบลอเนื้อหา — ตัวเรียกเป็นคนตัดสินใจว่าจะแสดงผลยังไง
   * ต้องเป็นฟังก์ชันที่คงตัว (`useCallback`) เพราะอยู่ใน dependency ของ effect ที่ผูก listener
   */
  onHide: (hidden: boolean) => void;
};

/** คีย์ที่ถือว่าเป็นความพยายามคัดลอกหน้าจอหรือเปิดเครื่องมือนักพัฒนา (FR-15.2) */
export function classifyKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">): { kind: ScreenEvent; detail: string } | null {
  const key = event.key;
  const mod = event.ctrlKey || event.metaKey;

  if (key === "PrintScreen") return { kind: ScreenEvent.PRINTSCREEN, detail: "PrintScreen" };
  if (key === "F12") return { kind: ScreenEvent.DEVTOOLS, detail: "F12" };

  if (mod && event.shiftKey && ["I", "J", "C"].includes(key.toUpperCase())) {
    return { kind: ScreenEvent.DEVTOOLS, detail: `Ctrl+Shift+${key.toUpperCase()}` };
  }
  if (mod && ["p", "s", "u"].includes(key.toLowerCase())) {
    return {
      kind: key.toLowerCase() === "p" ? ScreenEvent.PRINT : ScreenEvent.SHORTCUT,
      detail: `Ctrl+${key.toUpperCase()}`,
    };
  }
  return null;
}

/** DevTools ที่ผุดขึ้นมาจะกินพื้นที่หน้าต่าง ทำให้ช่องว่างระหว่าง outer/inner กว้างผิดปกติ */
const DEVTOOLS_GAP_PX = 170;

function devtoolsLikelyOpen(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.outerWidth - window.innerWidth > DEVTOOLS_GAP_PX ||
    window.outerHeight - window.innerHeight > DEVTOOLS_GAP_PX
  );
}

export function useScreenGuard({ enabled, lessonId, onHide }: ScreenGuardOptions) {
  const queueRef = React.useRef<ScreenEventInput[]>([]);

  React.useEffect(() => {
    if (!enabled) return;

    const queue = queueRef.current;

    /** ส่งคิวที่ค้างอยู่ — `sendBeacon` ส่งได้แม้หน้ากำลังจะปิด ต่างจาก fetch */
    const flush = () => {
      if (queue.length === 0) return;
      const events = queue.splice(0, MAX_EVENTS_PER_BATCH);
      const body = JSON.stringify({ events });
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (!navigator.sendBeacon("/api/events/screen", blob)) {
          void fetch("/api/events/screen", {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
          });
        }
      } catch {
        // รายงานไม่สำเร็จไม่ควรรบกวนการเรียนของผู้ใช้ — ปล่อยผ่าน
      }
    };

    const report = (event: ScreenEvent, detail?: string) => {
      if (queue.length >= MAX_EVENTS_PER_BATCH) return;
      queue.push({ event, lessonId, detail: detail ?? null });
    };

    const timer = window.setInterval(flush, EVENT_FLUSH_MS);

    const onKeyDown = (event: KeyboardEvent) => {
      const hit = classifyKey(event);
      if (!hit) return;

      // กันเฉพาะคีย์ที่กันได้จริง — PrintScreen เบราว์เซอร์ไม่ให้ยกเลิก
      if (hit.kind !== ScreenEvent.PRINTSCREEN) event.preventDefault();
      report(hit.kind, hit.detail);

      if (hit.kind === ScreenEvent.PRINTSCREEN) {
        // FR-15.2 — ล้าง clipboard แบบ best-effort แล้วดำหน้าจอไว้ครู่หนึ่ง
        void navigator.clipboard?.writeText("").catch(() => undefined);
        onHide(true);
        window.setTimeout(() => onHide(false), 1200);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      report(ScreenEvent.CONTEXT_MENU);
    };

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      report(ScreenEvent.COPY);
    };

    const onBlur = () => {
      report(ScreenEvent.BLUR);
      onHide(true);
    };
    const onFocus = () => onHide(false);

    const onVisibility = () => {
      if (document.hidden) {
        report(ScreenEvent.BLUR, "visibilitychange");
        onHide(true);
      } else {
        onHide(false);
      }
    };

    const onBeforePrint = () => report(ScreenEvent.PRINT, "beforeprint");

    // FR-15.6 — heuristic ล้วน จึงแค่เบลอกับบันทึกไว้ ไม่ปิดเนื้อหาถาวร
    // (จอเล็ก เครื่องช้า หรือการซูมหน้าจอ ทำให้ตรวจผิดได้ และคนที่ไม่ได้ทำอะไรผิดจะเสียหาย)
    let devtoolsWasOpen = false;
    const checkDevtools = () => {
      const open = devtoolsLikelyOpen();
      if (open !== devtoolsWasOpen) {
        devtoolsWasOpen = open;
        if (open) report(ScreenEvent.DEVTOOLS, "window-size-heuristic");
        onHide(open);
      }
    };
    const devtoolsTimer = window.setInterval(checkDevtools, 1500);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(devtoolsTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, lessonId, onHide]);
}
