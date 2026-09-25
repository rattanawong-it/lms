import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ตรวจ `Authorization: Bearer <CRON_SECRET>` แบบ timing-safe
 * (hash ก่อนเทียบ ความยาวจึงเท่ากันเสมอ ไม่เผยความยาวของ secret)
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
