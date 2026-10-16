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
 * Win+Shift+S / Cmd+Shift+3/4/5 — OS ดักคีย์ตัวสุดท้ายไปก่อน แต่ Win/Cmd กับ Shift ยังมาถึงหน้าเว็บ
 * จึง **ดำหน้าจอไว้ล่วงหน้า** ระหว่างที่กดสองปุ่มนี้ค้าง (FR-15.2 · CHANGELOG #52) · บนมือถือไม่มี event ใด ๆ
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
  /** จอดำทึบ (ความพยายามจับภาพ) — แยกจาก `onHide` ที่เป็นแค่เบลอ · ต้องคงตัวเช่นกัน */
  onBlackout: (active: boolean) => void;
};

type KeyInput = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** จอดำค้างหลังกด PrintScreen (เจ้าของระบบเลือก 1.5 วินาที) */
export const PRINTSCREEN_BLACKOUT_MS = 1500;
/** keydown กับ keyup ของ PrintScreen ครั้งเดียวกันนับเป็นครั้งเดียว */
const PRINTSCREEN_DEDUPE_MS = 1000;

/**
 * ตัวอักษรของปุ่มตาม **ตำแหน่งบนแป้น** (`event.code`) ไม่ใช่ตัวที่พิมพ์ออกมา
 * แป้นภาษาไทยทำให้ Ctrl+P ได้ `key = "ย"` และ Option บน Mac ทำให้ Cmd+Option+I ได้ `key = "ˆ"`
 * — ถ้าดูแค่ `key` คีย์ลัดพวกนี้หลุดทั้งหมด · ไม่มี `code` (เบราว์เซอร์เก่า) จึงค่อยใช้ `key`
 */
function letterOf(event: KeyInput): string {
  if (event.code?.startsWith("Key")) return event.code.slice(3);
  return event.key.length === 1 ? event.key.toUpperCase() : "";
}

/** คีย์ที่ถือว่าเป็นความพยายามคัดลอกหน้าจอหรือเปิดเครื่องมือนักพัฒนา (FR-15.2) */
export function classifyKey(event: KeyInput): { kind: ScreenEvent; detail: string } | null {
  if (event.key === "PrintScreen" || event.code === "PrintScreen") {
    return { kind: ScreenEvent.PRINTSCREEN, detail: "PrintScreen" };
  }
  if (event.key === "F12" || event.code === "F12") return { kind: ScreenEvent.DEVTOOLS, detail: "F12" };

  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return null;
  const letter = letterOf(event);
  const name = event.metaKey ? "Cmd" : "Ctrl";

  // Ctrl+Shift+I/J/C (Chrome/Edge) · Ctrl+Shift+K (Firefox) · Cmd+Option+I/J/C/K (Mac)
  // Option นับเฉพาะคู่กับ Cmd — Ctrl+Alt บน Windows คือ AltGr ของบางภาษา (พิมพ์ตัวอักษรปกติ)
  const macOption = event.metaKey && event.altKey;
  if ((event.shiftKey || macOption) && ["I", "J", "C", "K"].includes(letter)) {
    return { kind: ScreenEvent.DEVTOOLS, detail: `${name}+${macOption ? "Option" : "Shift"}+${letter}` };
  }
  // Ctrl+P พิมพ์ · Ctrl+S บันทึกหน้า · Ctrl+U / Cmd+Option+U ดูซอร์ส
  if (["P", "S", "U"].includes(letter)) {
    return {
      kind: letter === "P" ? ScreenEvent.PRINT : ScreenEvent.SHORTCUT,
      detail: `${name}+${event.altKey ? "Option+" : ""}${letter}`,
    };
  }
  return null;
}

/**
 * กด Win+Shift (Windows) หรือ Cmd+Shift (Mac) ค้างอยู่ — ขั้นแรกของคีย์ลัดจับภาพของ OS
 * Windows ส่งปุ่ม Win มาเป็น `metaKey` เหมือน Cmd ของ Mac
 */
export function isCaptureChord(event: Pick<KeyboardEvent, "metaKey" | "shiftKey">): boolean {
  return event.metaKey && event.shiftKey;
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

export function useScreenGuard({ enabled, lessonId, onHide, onBlackout }: ScreenGuardOptions) {
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

    // จอดำมาจาก 2 ทาง: PrintScreen (ค้างตามเวลา) กับ Win/Cmd+Shift (ค้างตามที่กดปุ่ม) — ดำถ้าทางใดทางหนึ่งยังอยู่
    let printScreenUntil = 0;
    let lastPrintScreen = 0;
    let chordHeld = false;
    let blackoutTimer: number | undefined;
    const syncBlackout = () => onBlackout(chordHeld || Date.now() < printScreenUntil);

    const onPrintScreen = () => {
      const now = Date.now();
      if (now - lastPrintScreen < PRINTSCREEN_DEDUPE_MS) return;
      lastPrintScreen = now;
      report(ScreenEvent.PRINTSCREEN, "PrintScreen");
      // ภาพถูกจับไปก่อน JS ทำงานเสมอ — สิ่งที่ช่วยได้จริงคือล้าง clipboard (best-effort)
      void navigator.clipboard?.writeText("").catch(() => undefined);
      printScreenUntil = now + PRINTSCREEN_BLACKOUT_MS;
      syncBlackout();
      window.clearTimeout(blackoutTimer);
      blackoutTimer = window.setTimeout(syncBlackout, PRINTSCREEN_BLACKOUT_MS);
    };

    const releaseChord = () => {
      if (!chordHeld) return;
      chordHeld = false;
      syncBlackout();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isCaptureChord(event) && !chordHeld) {
        chordHeld = true;
        report(ScreenEvent.PRINTSCREEN, /Mac/i.test(navigator.platform) ? "Cmd+Shift" : "Win+Shift");
        syncBlackout();
      }

      const hit = classifyKey(event);
      if (!hit) return;
      if (hit.kind === ScreenEvent.PRINTSCREEN) {
        onPrintScreen();
        return;
      }

      // กันเฉพาะคีย์ที่กันได้จริง — PrintScreen เบราว์เซอร์ไม่ให้ยกเลิก
      event.preventDefault();
      report(hit.kind, hit.detail);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      // Windows มักส่ง PrintScreen มาแค่ keyup
      if (event.key === "PrintScreen" || event.code === "PrintScreen") onPrintScreen();
      if (!isCaptureChord(event)) releaseChord();
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
    const onFocus = () => {
      onHide(false);
      // หน้าต่างจับภาพของ OS กินโฟกัสไป — keyup ของ Win/Cmd+Shift ไม่มาถึง จึงปลดตอนกลับมา
      releaseChord();
    };

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
    document.addEventListener("keyup", onKeyUp);
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
      window.clearTimeout(blackoutTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, lessonId, onHide, onBlackout]);
}
