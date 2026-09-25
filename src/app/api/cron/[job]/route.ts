import { env } from "@/lib/env";
import { isCronAuthorized } from "@/features/cron/lib/auth";
import { runCleanup, runDueReminders, runLiveReminders } from "@/features/cron/jobs";
import { runOrderExpiry } from "@/features/commerce/lib/expire";

/**
 * FR-12.3 · NFR-05 — งานตามเวลา (phase-3-plan ขั้น 3 · Q4)
 *
 *   /api/cron/reminders  ทุกชั่วโมง   งานใกล้ครบกำหนด (DUE_SOON)
 *   /api/cron/live       ทุก 15 นาที  คาบเรียนสดใกล้เริ่ม (LIVE_SOON)
 *   /api/cron/cleanup    วันละครั้ง    ลบ log เก่าตาม NFR-05
 *   /api/cron/orders     ทุก 15 นาที  ปิดคำสั่งซื้อที่หมดอายุ (ถามผลผู้ให้บริการก่อน · M18)
 *
 * ไม่มี session — ผู้เรียก (Vercel Cron / crontab ของสถาบัน / `pnpm cron <ชื่อ>`) พิสูจน์ตัวด้วย `CRON_SECRET`
 * ไม่ได้ตั้ง `CRON_SECRET` → 404 เหมือนไม่มีเส้นทางนี้ · รับทั้ง GET (Vercel Cron) และ POST
 */
const JOBS = {
  reminders: runDueReminders,
  live: runLiveReminders,
  cleanup: runCleanup,
  orders: runOrderExpiry,
} as const;

async function handle(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (!env.CRON_SECRET || !Object.hasOwn(JOBS, job)) return new Response(null, { status: 404 });
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }

  try {
    const result = await JOBS[job as keyof typeof JOBS]();
    return Response.json({ job, ...result });
  } catch (error) {
    console.error(`[cron] ${job} ล้มเหลว`, error);
    return Response.json({ job, error: "ทำงานไม่สำเร็จ" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
