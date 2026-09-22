import { describe, expect, it } from "vitest";
import { classifyKey } from "@/components/protected-viewer/use-screen-guard";
import { ScreenEvent } from "@/generated/prisma/enums";

/** M15 · FR-15.2 — คีย์ไหนถือว่าเป็นความพยายามคัดลอกหน้าจอ */

function key(
  k: string,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
) {
  return {
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
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

  it("คีย์ปกติที่ผู้เรียนใช้จริงต้องไม่ถูกจับ", () => {
    expect(classifyKey(key("a"))).toBeNull();
    expect(classifyKey(key("ArrowRight"))).toBeNull();
    expect(classifyKey(key("c", { ctrl: true }))).toBeNull(); // Ctrl+C ดักที่ event copy แทน
    expect(classifyKey(key("F5"))).toBeNull();
  });
});
