import { requireApiUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { EXPORT_QUOTA } from "@/features/privacy/schemas";
import { buildPersonalDataExport } from "@/features/privacy/lib/export";

/**
 * M17 · FR-17.4 — ดาวน์โหลดข้อมูลส่วนบุคคลของตนเองเป็น JSON
 * ตัวตนมาจาก session เท่านั้น ไม่รับ id ใด ๆ จาก client · วันละ 3 ครั้งต่อผู้ใช้
 */
export async function GET() {
  const user = await requireApiUser();

  const quota = rateLimit(`privacy-export:${user.id}`, EXPORT_QUOTA);
  if (!quota.ok) {
    return new Response("ส่งออกข้อมูลได้วันละ 3 ครั้ง กรุณาลองใหม่ภายหลัง", {
      status: 429,
      headers: { "Retry-After": String(quota.retryAfterSec), "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const data = await buildPersonalDataExport(user.id);
  await writeAudit({ actorId: user.id, action: "privacy.export", entity: "User", entityId: user.id });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="krirk-lms-my-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
