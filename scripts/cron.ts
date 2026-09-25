import { config } from "dotenv";

config({ quiet: true });

/**
 * เรียก cron ตอนพัฒนาโดยไม่ต้องมี scheduler (phase-3-plan ขั้น 3)
 *   pnpm cron reminders | live | cleanup
 * ต้องเปิด dev server ไว้ และตั้ง CRON_SECRET ใน .env
 * ตอน deploy ให้ scheduler (Vercel Cron / crontab) เรียก URL เดียวกันพร้อม header เดียวกัน
 */
const JOBS = ["reminders", "live", "cleanup", "orders"];
const job = process.argv[2];
const secret = process.env.CRON_SECRET;
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!job || !JOBS.includes(job)) {
  console.error(`ใช้งาน: pnpm cron <${JOBS.join("|")}>`);
  process.exit(1);
}
if (!secret) {
  console.error("ยังไม่ได้ตั้ง CRON_SECRET ใน .env");
  process.exit(1);
}

async function main() {
  const res = await fetch(new URL(`/api/cron/${job}`, baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  console.log(res.status, await res.text());
  if (!res.ok) process.exitCode = 1;
}

void main();
