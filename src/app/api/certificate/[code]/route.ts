import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireApiUser } from "@/lib/rbac";
import { presignGet } from "@/lib/storage";
import { normalizeCode } from "@/features/certificates/schemas";
import { ensureCertificatePdf } from "@/features/certificates/lib/issue";

/**
 * M10 · FR-10.4 — ดาวน์โหลด PDF ใบประกาศ
 *
 * เจ้าของใบ หรือผู้ดูแลของคณะเจ้าของคอร์ส · ใบที่ถูกเพิกถอนดาวน์โหลดไม่ได้ (หน้า verify ยังบอกสถานะ)
 * PDF ยังไม่มี (after() ไม่สำเร็จ/ใบเก่า) → สร้างตอนนี้ · ตอบเป็น redirect ไป signed URL 5 นาที
 * ไม่ครอบ ProtectedViewer — เป็นเอกสารของผู้เรียนเอง (phase-2-plan ขั้น 6)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await requireApiUser();
  const { code } = await params;

  const cert = await db.certificate.findUnique({
    where: { code: normalizeCode(decodeURIComponent(code)) },
    select: { id: true, code: true, userId: true, courseId: true, revokedAt: true },
  });
  if (!cert) notFound();
  if (cert.userId !== user.id) await assertCourseAccess(cert.courseId, "manage");
  if (cert.revokedAt) forbidden();

  const key = await ensureCertificatePdf(cert.id);
  if (!key) notFound();

  const url = await presignGet(key, { downloadName: `ใบประกาศ-${cert.code}.pdf` });
  return Response.redirect(url, 302);
}
