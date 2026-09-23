import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { assertCourseAccess, requireAtLeast, requireUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { EnrollmentStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { CODE_PATTERN, normalizeCode, parseCertificateTemplate } from "@/features/certificates/schemas";
import { issueCertificate } from "@/features/certificates/lib/issue";

/** M10 · FR-10.2–10.5 — ใบประกาศ */

/**
 * FR-10.4 — ใบประกาศของฉัน
 * คอร์สที่เรียนจบก่อนมีระบบใบประกาศ (หรือออกไม่สำเร็จ) ถูกออกให้ตอนเปิดหน้านี้ — ไม่มี cron
 */
export async function getMyCertificates() {
  const user = await requireUser();

  const missing = await db.enrollment.findMany({
    where: { userId: user.id, status: EnrollmentStatus.COMPLETED, course: { certificates: { none: { userId: user.id } } } },
    select: { courseId: true },
  });
  for (const e of missing) await issueCertificate(user.id, e.courseId);

  return db.certificate.findMany({
    where: { userId: user.id },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      code: true,
      issuedAt: true,
      revokedAt: true,
      course: { select: { title: true, slug: true } },
    },
  });
}

/** หน้าสาธารณะ /verify/[code] — ลองสุ่มรหัสได้ จึงจำกัดความถี่ต่อ IP */
const VERIFY_QUOTA = { windowSec: 60, max: 30 };

export type Verification =
  | { state: "limited" }
  | { state: "not-found"; code: string }
  | {
      state: "valid" | "revoked";
      code: string;
      name: string;
      course: string;
      issuedAt: Date;
      revokedAt: Date | null;
    };

export async function getVerification(rawCode: string): Promise<Verification> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (!rateLimit(`verify:${ip}`, VERIFY_QUOTA).ok) return { state: "limited" };

  const code = normalizeCode(decodeURIComponent(rawCode));
  if (!CODE_PATTERN.test(code)) return { state: "not-found", code };

  const cert = await db.certificate.findUnique({
    where: { code },
    select: {
      code: true,
      issuedAt: true,
      revokedAt: true,
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });
  if (!cert) return { state: "not-found", code };
  // ไม่เปิดเผยเหตุผลการเพิกถอนต่อสาธารณะ — ผู้ดูแลเห็นในหน้าผู้ดูแลเท่านั้น
  return {
    state: cert.revokedAt ? "revoked" : "valid",
    code: cert.code,
    name: cert.user.name,
    course: cert.course.title,
    issuedAt: cert.issuedAt,
    revokedAt: cert.revokedAt,
  };
}

/** FR-10.2 — หน้าแม่แบบใบประกาศของคอร์ส */
export async function getCertificateEditor(courseId: string) {
  await assertCourseAccess(courseId, "teach");
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { id: true, title: true, certificateTemplate: true, _count: { select: { certificates: true } } },
  });
  const template = parseCertificateTemplate(course.certificateTemplate);
  const ids = [template.logoAssetId, template.signatureAssetId].filter((id): id is string => Boolean(id));
  const assets = ids.length
    ? await db.asset.findMany({ where: { id: { in: ids } }, select: { id: true, originalName: true, size: true } })
    : [];
  const asValue = (id: string | null) => {
    const a = assets.find((x) => x.id === id);
    return a ? { assetId: a.id, originalName: a.originalName, sizeLabel: `${Math.max(1, Math.round(Number(a.size) / 1024))} KB` } : null;
  };

  return {
    course: { id: course.id, title: course.title },
    template,
    custom: course.certificateTemplate !== null,
    issuedCount: course._count.certificates,
    logo: asValue(template.logoAssetId),
    signature: asValue(template.signatureAssetId),
  };
}

export type CertificateEditorData = Awaited<ReturnType<typeof getCertificateEditor>>;

/** FR-10.5 — รายการใบประกาศสำหรับผู้ดูแล (ผู้ดูแลคณะเห็นเฉพาะคอร์สของคณะตัวเอง) */
export async function getAdminCertificates(query: string) {
  const user = await requireAtLeast(Role.DEPT_ADMIN);
  const q = query.trim();

  const where: Prisma.CertificateWhereInput = {
    ...(user.role === Role.SUPER_ADMIN ? {} : { course: { departmentId: user.departmentId ?? "__none__" } }),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { course: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  return db.certificate.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      issuedAt: true,
      revokedAt: true,
      revokeReason: true,
      user: { select: { name: true, email: true } },
      course: { select: { title: true } },
    },
  });
}
