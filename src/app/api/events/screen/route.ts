import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { screenEventBatchSchema } from "@/features/protection/schemas";

/**
 * M15 · FR-15.8 — รับรายงานเหตุการณ์หน้าจอจาก `<ProtectedViewer>`
 *
 * ถูกเรียกด้วย `navigator.sendBeacon()` ซึ่ง **ไม่อ่านคำตอบและไม่ retry**
 * จึงตอบ 204 เปล่า ๆ เสมอเมื่อรับได้ และไม่ต้องมีข้อความให้ client อ่าน
 *
 * ต้องจำกัดความถี่เพราะเป็นเส้นทางที่ client ยิงเองได้อิสระ — ถ้าไม่จำกัด
 * หน้าเว็บที่ถูกแก้ในเบราว์เซอร์ยิงรัว ๆ จะทำให้ตาราง `ScreenEventLog` บวมจนหารายงานจริงไม่เจอ
 */
const QUOTA = { windowSec: 5 * 60, max: 120 };

export async function POST(request: Request) {
  const user = await requireApiUser();

  if (!rateLimit(`screen-events:${user.id}`, QUOTA).ok) {
    return new Response(null, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = screenEventBatchSchema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });

  const head = await headers();
  const ip = head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? head.get("x-real-ip");
  const userAgent = head.get("user-agent");

  // บทเรียนที่ client อ้างมาอาจไม่มีจริง — ปล่อยให้ foreign key ล้มไม่ได้ จึงกรองก่อน
  const lessonIds = [
    ...new Set(parsed.data.events.flatMap((e) => (e.lessonId ? [e.lessonId] : []))),
  ];
  const known = new Set(
    lessonIds.length > 0
      ? (
          await db.lesson.findMany({
            where: { id: { in: lessonIds } },
            select: { id: true },
          })
        ).map((l) => l.id)
      : [],
  );

  await db.screenEventLog.createMany({
    data: parsed.data.events.map((event) => ({
      userId: user.id,
      lessonId: event.lessonId && known.has(event.lessonId) ? event.lessonId : null,
      event: event.event,
      meta: event.detail ? { detail: event.detail } : undefined,
      ip,
      userAgent,
    })),
  });

  return new Response(null, { status: 204 });
}
