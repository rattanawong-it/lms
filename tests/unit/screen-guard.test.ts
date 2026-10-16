import { describe, expect, it } from "vitest";
import { classifyKey, isCaptureChord } from "@/components/protected-viewer/use-screen-guard";
import { ScreenEvent } from "@/generated/prisma/enums";

/** M15 · FR-15.2 — คีย์ไหนถือว่าเป็นความพยายามคัดลอกหน้าจอ */

type Mods = { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; code?: string };

/** `code` ตั้งต้นเดาจากตัวอักษรภาษาอังกฤษ (แป้น US) — ส่ง `code` เองเมื่อจำลองแป้นอื่น */
function key(k: string, mods: Mods = {}) {
  const guess = /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k;
  return {
    key: k,
    code: mods.code ?? guess,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  };
}

describe("classifyKey", () => {
  it("PrintScreen ถือเป็นการจับภาพหน้าจอ", () => {
    expect(classifyKey(key("PrintScreen"))?.kind).toBe(ScreenEvent.PRINTSCREEN);
  });

  it("F12 และ Ctrl+Shift+I/J/C ถือเป็นการเปิดเครื่องมือนักพัฒนา", () => {
    expect(classifyKey(key("F12"))?.kind).toBe(ScreenEvent.DEVTOOLS);
    for (const k of ["I", "J", "C"]) {
      expect(classifyKey(key(k, { ctrl: true, shift: true }))?.kind, k).toBe(ScreenEvent.DEVTOOLS);
    }
  });

  it("Ctrl+Shift+K ของ Firefox ถือเป็นการเปิดเครื่องมือนักพัฒนา", () => {
    expect(classifyKey(key("K", { ctrl: true, shift: true }))?.kind).toBe(ScreenEvent.DEVTOOLS);
  });

  it("รับทั้งตัวพิมพ์เล็กและใหญ่ (Shift ทำให้ค่า key เปลี่ยน)", () => {
    expect(classifyKey(key("i", { ctrl: true, shift: true }))?.kind).toBe(ScreenEvent.DEVTOOLS);
  });

  it("Ctrl+P แยกเป็นการสั่งพิมพ์ ส่วน Ctrl+S / Ctrl+U เป็นคีย์ลัดทั่วไป", () => {
    expect(classifyKey(key("p", { ctrl: true }))?.kind).toBe(ScreenEvent.PRINT);
    expect(classifyKey(key("s", { ctrl: true }))?.kind).toBe(ScreenEvent.SHORTCUT);
    expect(classifyKey(key("u", { ctrl: true }))?.kind).toBe(ScreenEvent.SHORTCUT);
  });

  it("บน macOS ใช้ Cmd แทน Ctrl", () => {
    expect(classifyKey(key("p", { meta: true }))?.kind).toBe(ScreenEvent.PRINT);
  });

  it("แป้นภาษาไทย: Ctrl+P ได้ key เป็น 'ย' แต่ตำแหน่งปุ่มยังเป็น KeyP", () => {
    expect(classifyKey(key("ย", { ctrl: true, code: "KeyP" }))?.kind).toBe(ScreenEvent.PRINT);
    expect(classifyKey(key("ห", { ctrl: true, code: "KeyS" }))?.kind).toBe(ScreenEvent.SHORTCUT);
    expect(classifyKey(key("ร", { ctrl: true, shift: true, code: "KeyI" }))?.kind).toBe(ScreenEvent.DEVTOOLS);
  });

  it("Mac: Cmd+Option+I/J/C ได้ key เป็นอักขระพิเศษ แต่ต้องจับได้ · Cmd+Option+U = ดูซอร์ส", () => {
    expect(classifyKey(key("ˆ", { meta: true, alt: true, code: "KeyI" }))?.detail).toBe("Cmd+Option+I");
    expect(classifyKey(key("∆", { meta: true, alt: true, code: "KeyJ" }))?.kind).toBe(ScreenEvent.DEVTOOLS);
    expect(classifyKey(key("¨", { meta: true, alt: true, code: "KeyU" }))?.kind).toBe(ScreenEvent.SHORTCUT);
  });

  it("Ctrl+Alt (AltGr ของบางภาษา) ไม่ถือเป็นการเปิด DevTools", () => {
    expect(classifyKey(key("ć", { ctrl: true, alt: true, code: "KeyC" }))).toBeNull();
  });

  it("ไม่มี code (เบราว์เซอร์เก่า) ใช้ key แทน", () => {
    expect(classifyKey({ ...key("p", { ctrl: true }), code: "" })?.kind).toBe(ScreenEvent.PRINT);
  });

  it("คีย์ปกติที่ผู้เรียนใช้จริงต้องไม่ถูกจับ", () => {
    expect(classifyKey(key("a"))).toBeNull();
    expect(classifyKey(key("ArrowRight"))).toBeNull();
    expect(classifyKey(key("c", { ctrl: true }))).toBeNull(); // Ctrl+C ดักที่ event copy แทน
    expect(classifyKey(key("F5"))).toBeNull();
    expect(classifyKey(key("ย", { code: "KeyP" }))).toBeNull(); // พิมพ์ภาษาไทยปกติ
  });
});

describe("isCaptureChord — ดำล่วงหน้าก่อน OS จับภาพ", () => {
  it("Win+Shift / Cmd+Shift ค้างอยู่", () => {
    expect(isCaptureChord({ metaKey: true, shiftKey: true })).toBe(true);
  });

  it("ปุ่มเดียว หรือ Ctrl+Shift ไม่นับ", () => {
    expect(isCaptureChord({ metaKey: true, shiftKey: false })).toBe(false);
    expect(isCaptureChord({ metaKey: false, shiftKey: true })).toBe(false);
  });
});
