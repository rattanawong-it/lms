import "server-only";
import { db } from "@/lib/db";
import { env, hasLine } from "@/lib/env";
import { requireUser } from "@/lib/rbac";
import { activeLinkCode } from "@/features/line/lib/link";

/** M12 · FR-12.1 — สถานะการเชื่อมต่อ LINE ของตัวเอง */
export async function getMyLineStatus() {
  const user = await requireUser();
  if (!hasLine) return { enabled: false as const };

  const [link, code] = await Promise.all([
    db.lineLink.findUnique({ where: { userId: user.id }, select: { linkedAt: true } }),
    activeLinkCode(user.id),
  ]);
  const basicId = env.LINE_OA_BASIC_ID?.trim();
  return {
    enabled: true as const,
    linkedAt: link?.linkedAt ?? null,
    code: link ? null : code,
    oaId: basicId || null,
    addFriendUrl: basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null,
  };
}
