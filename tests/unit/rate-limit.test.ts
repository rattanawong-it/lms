import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

/** ใช้กับการขอ signed URL ของวิดีโอ (FR-15.7) และการรายงาน screen event (FR-15.8) */

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const quota = { windowSec: 60, max: 3 };

  it("ปล่อยผ่านจนครบโควตาแล้วจึงปฏิเสธ", () => {
    expect(rateLimit("a", quota)).toMatchObject({ ok: true, remaining: 2 });
    expect(rateLimit("a", quota)).toMatchObject({ ok: true, remaining: 1 });
    expect(rateLimit("a", quota)).toMatchObject({ ok: true, remaining: 0 });

    const blocked = rateLimit("a", quota);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("แต่ละคีย์มีโควตาของตัวเอง — ผู้ใช้คนหนึ่งไม่ทำให้อีกคนโดนบล็อก", () => {
    rateLimit("a", quota);
    rateLimit("a", quota);
    rateLimit("a", quota);
    expect(rateLimit("a", quota).ok).toBe(false);
    expect(rateLimit("b", quota).ok).toBe(true);
  });

  it("โควตากลับมาใหม่เมื่อพ้นหน้าต่างเวลา", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("a", quota);
    expect(rateLimit("a", quota).ok).toBe(false);

    vi.advanceTimersByTime(60_000);
    expect(rateLimit("a", quota)).toMatchObject({ ok: true, remaining: 2 });
  });

  it("บอกเวลาที่ต้องรอเป็นวินาทีที่ปัดขึ้นเสมอ ไม่เคยเป็น 0 ตอนถูกบล็อก", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("a", quota);
    vi.advanceTimersByTime(59_900);
    const blocked = rateLimit("a", quota);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
  });
});
