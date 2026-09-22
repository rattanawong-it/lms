import "server-only";

/**
 * ตัวจำกัดความถี่แบบ fixed window เก็บในหน่วยความจำของ process
 *
 * ใช้กับเส้นทางที่ client เรียกเองได้ถี่ ๆ — การขอ signed URL ของวิดีโอ (FR-15.7)
 * และการรายงาน screen event (FR-15.8) — เพื่อไม่ให้กลายเป็นช่องดูดไฟล์หรือยัด log
 *
 * **ข้อจำกัดที่ต้องรู้:** นับแยกต่อ process ถ้า deploy หลาย instance โควตาจะคูณตามจำนวน instance
 * เฟส 1 รัน instance เดียวจึงพอ · ถ้าขยายเป็นหลาย instance ต้องย้ายไปใช้ Redis
 * (การจำกัดความถี่ของการ login เป็นคนละตัว — Better Auth จัดการเองใน `lib/auth.ts`)
 */
type Bucket = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets: Map<string, Bucket> | undefined;
};

const buckets = globalForRateLimit.rateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.rateLimitBuckets = buckets;

/** กันหน่วยความจำบวมเมื่อมีคีย์ใหม่เรื่อย ๆ — เก็บกวาดคีย์ที่หมดอายุทุกครั้งที่แตะจำนวนนี้ */
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** จำนวนครั้งที่เหลือในหน้าต่างปัจจุบัน */
  remaining: number;
  /** วินาทีที่ต้องรอจนกว่าโควตาจะรีเซ็ต (0 เมื่อยังไม่เต็ม) */
  retryAfterSec: number;
};

/**
 * นับหนึ่งครั้งใน window ของ `key` แล้วบอกว่าเกินโควตาหรือยัง
 * `key` ควรผูกกับผู้ใช้หรือ IP เสมอ เช่น `video:<userId>`
 */
export function rateLimit(
  key: string,
  options: { windowSec: number; max: number },
): RateLimitResult {
  const now = Date.now();
  if (buckets.size >= SWEEP_THRESHOLD) sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowSec * 1000 });
    return { ok: true, remaining: options.max - 1, retryAfterSec: 0 };
  }

  existing.count += 1;

  if (existing.count > options.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: options.max - existing.count, retryAfterSec: 0 };
}

/** ใช้ในเทสต์เท่านั้น — ล้างตัวนับทั้งหมด */
export function resetRateLimits(): void {
  buckets.clear();
}
