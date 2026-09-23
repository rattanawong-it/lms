import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { formatDateLong } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { putObject, readObject } from "@/lib/storage";
import { AssetKind, AssetStatus, NotificationType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import {
  generateCertificateCode,
  parseCertificateTemplate,
  type CertificateTemplate,
} from "@/features/certificates/schemas";
import { buildCertificateModel } from "@/features/certificates/lib/model";
import { renderCertificatePdf, type CertificateImages } from "@/features/certificates/lib/pdf";
import type { TemplateVars } from "@/features/certificates/lib/text";

/**
 * M10 · FR-10.1 — ออกใบประกาศเมื่อเรียนจบ (system-design §5.6)
 *
 * แถว `Certificate` ถูกสร้างทันที (หน้า /verify ใช้ได้เลย) ส่วน PDF สร้างหลังตอบผู้ใช้ด้วย `after()`
 * ผู้เรียนไม่ต้องรอเรนเดอร์ตอนกดเรียนจบ · ถ้าสร้างไม่สำเร็จ ตอนดาวน์โหลดจะสร้างใหม่ให้เอง
 *
 * หนึ่งคนหนึ่งใบต่อคอร์ส (unique [userId, courseId]) · ใบที่ออกแล้วไม่ถูกเพิกถอนอัตโนมัติ
 * แม้ภายหลังผู้เรียนจะหลุดเงื่อนไขจบ (เจ้าของระบบยืนยัน 2026-09-23) — เพิกถอนได้โดยผู้ดูแลเท่านั้น (FR-10.5)
 */

export function verifyUrlFor(code: string): string {
  return new URL(`/verify/${code}`, env.NEXT_PUBLIC_APP_URL).toString();
}

/** รูปบนใบประกาศ — react-pdf อ่านได้เฉพาะ PNG/JPEG */
export const CERTIFICATE_IMAGE_MIMES = ["image/png", "image/jpeg"];

async function loadImage(assetId: string | null): Promise<Buffer | null> {
  if (!assetId) return null;
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { key: true, kind: true, mime: true, status: true } });
  if (!asset || asset.kind !== AssetKind.IMAGE || asset.status !== AssetStatus.READY) return null;
  if (!CERTIFICATE_IMAGE_MIMES.includes(asset.mime)) return null;
  const bytes = await readObject(asset.key);
  return bytes ? Buffer.from(bytes) : null;
}

export async function loadTemplateImages(template: CertificateTemplate): Promise<CertificateImages> {
  const [logo, signature] = await Promise.all([loadImage(template.logoAssetId), loadImage(template.signatureAssetId)]);
  return { logo, signature };
}

/** เรนเดอร์ PDF จากแม่แบบ + ตัวแปร (ใช้ทั้งใบจริงและตัวอย่างในหน้าแก้แม่แบบ) */
export async function renderFromTemplate(template: CertificateTemplate, vars: TemplateVars): Promise<Buffer> {
  const model = buildCertificateModel(template, vars, verifyUrlFor(vars.code));
  return renderCertificatePdf(model, await loadTemplateImages(template));
}

const pdfKeyOf = (code: string) => `certificates/${code}.pdf`;

/** สร้าง PDF ของใบประกาศที่ยังไม่มีไฟล์ แล้วเก็บ `pdfKey` · คืน key (null = ไม่พบใบประกาศ) */
export async function ensureCertificatePdf(certificateId: string): Promise<string | null> {
  const cert = await db.certificate.findUnique({
    where: { id: certificateId },
    select: {
      code: true,
      pdfKey: true,
      issuedAt: true,
      user: { select: { name: true } },
      course: { select: { title: true, certificateTemplate: true } },
    },
  });
  if (!cert) return null;
  if (cert.pdfKey) return cert.pdfKey;

  const pdf = await renderFromTemplate(parseCertificateTemplate(cert.course.certificateTemplate), {
    name: cert.user.name,
    course: cert.course.title,
    date: formatDateLong(cert.issuedAt),
    code: cert.code,
  });
  const key = pdfKeyOf(cert.code);
  await putObject(key, pdf, "application/pdf");
  await db.certificate.update({ where: { id: certificateId }, data: { pdfKey: key } });
  return key;
}

/**
 * ออกใบประกาศ (ถ้ายังไม่มี) — เรียกเมื่อ enrollment เพิ่งเปลี่ยนเป็น COMPLETED
 * รหัสสุ่มชนกันได้ (โอกาสต่ำมาก) จึงลองใหม่ด้วยรหัสใหม่
 */
export async function issueCertificate(userId: string, courseId: string): Promise<void> {
  const existing = await db.certificate.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (existing) return;

  const course = await db.course.findUnique({ where: { id: courseId }, select: { title: true } });
  if (!course) return;

  let created: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      created = await db.certificate.create({
        data: { userId, courseId, code: generateCertificateCode(new Date().getFullYear()) },
        select: { id: true, code: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      // [userId, courseId] ชน = มีคนออกให้ไปพร้อมกันแล้ว · ไม่งั้นคือ code ชน → สุ่มใหม่
      // (ไม่อ่าน meta.target เพราะ driver adapter ของ Prisma 7 ไม่ได้ใส่ให้ทุกครั้ง)
      const raced = await db.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { id: true },
      });
      if (raced) return;
    }
  }
  if (!created) return;

  await writeAudit({
    actorId: null,
    action: "certificate.issue",
    entity: "Certificate",
    entityId: created.id,
    after: { code: created.code, userId, courseId },
  });
  await notify({
    userIds: [userId],
    type: NotificationType.CERTIFICATE,
    title: `ได้รับใบประกาศ “${course.title}”`,
    body: `รหัส ${created.code}`,
    link: "/certificates",
  });

  const id = created.id;
  const render = () =>
    ensureCertificatePdf(id).catch((error) => console.error("[certificate] สร้าง PDF ไม่สำเร็จ", error));
  try {
    after(render);
  } catch {
    // นอก request (เช่น script) ไม่มี after() — สร้างเลย
    await render();
  }
}
