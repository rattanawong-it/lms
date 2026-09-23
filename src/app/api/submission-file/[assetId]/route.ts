import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireApiUser } from "@/lib/rbac";
import { presignGet } from "@/lib/storage";
import { AssetStatus } from "@/generated/prisma/enums";

/**
 * M08 · FR-08.4 — ไฟล์งานที่ผู้เรียนส่ง
 *
 * เปิดได้เฉพาะเจ้าของงาน หรือผู้สอน/ผู้ดูแลของคอร์สที่งานนั้นสังกัดจริง
 * ตอบเป็น redirect ไป signed URL อายุ 5 นาที (FR-15.7) — ไม่ครอบ ProtectedViewer เพราะเป็นไฟล์ของผู้เรียนเอง
 */
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const user = await requireApiUser();
  const { assetId } = await params;

  // ไฟล์เดียวอาจถูกแนบซ้ำในการส่งหลายครั้งของคนเดียวกัน — ทุกแถวชี้ไปที่งานเดียวกันและเจ้าของคนเดียวกัน
  const link = await db.submissionFile.findFirst({
    where: { assetId },
    select: {
      asset: { select: { key: true, originalName: true, status: true } },
      submission: { select: { userId: true, assignment: { select: { courseId: true } } } },
    },
  });
  if (!link || link.asset.status !== AssetStatus.READY) notFound();

  // ไม่ใช่เจ้าของ → ต้องสอน/ดูแลคอร์สนี้ (ไม่ผ่าน = 403 จาก assertCourseAccess)
  if (link.submission.userId !== user.id) {
    await assertCourseAccess(link.submission.assignment.courseId, "teach");
  }

  const url = await presignGet(link.asset.key, { downloadName: link.asset.originalName });
  return Response.redirect(url, 302);
}
