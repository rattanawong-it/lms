"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { formatDateLong } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { AssetKind, NotificationType } from "@/generated/prisma/enums";
import { findReadyAsset } from "@/features/uploads/service";
import {
  certificateTemplateSchema,
  parseCertificateTemplate,
  revokeSchema,
  type CertificateTemplate,
} from "@/features/certificates/schemas";
import { CERTIFICATE_IMAGE_MIMES, renderFromTemplate } from "@/features/certificates/lib/issue";

/**
 * M10 · FR-10.2 / FR-10.5 — แม่แบบใบประกาศของคอร์ส และการเพิกถอน
 * ใบที่ออกแล้วไม่เปลี่ยนตามแม่แบบใหม่ (PDF ถูกสร้างครั้งเดียว) — แม่แบบมีผลกับใบที่ออกหลังจากนี้
 */

const idSchema = z.cuid();

type Parsed =
  | { ok: true; courseId: string; userId: string; template: CertificateTemplate }
  | { ok: false; result: ActionResult };

/** ตรวจฟอร์มแม่แบบ + สิทธิ์ใช้รูป (ต้องเป็นผู้อัปโหลดเอง หรือรูปที่แม่แบบเดิมใช้อยู่แล้ว) */
async function parseTemplateForm(formData: FormData): Promise<Parsed> {
  const courseId = idSchema.safeParse(formData.get("courseId"));
  if (!courseId.success) return { ok: false, result: { ok: false, message: "ไม่พบคอร์ส" } };
  const { user } = await assertCourseAccess(courseId.data, "teach");

  const parsed = certificateTemplateSchema.safeParse({
    heading: formData.get("heading"),
    body: formData.get("body"),
    signerName: formData.get("signerName") ?? "",
    signerTitle: formData.get("signerTitle") ?? "",
    logoAssetId: formData.get("logoAssetId"),
    signatureAssetId: formData.get("signatureAssetId"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      result: { ok: false, message: "กรุณาตรวจสอบข้อมูลอีกครั้ง", fieldErrors: zodToFieldErrors(parsed.error) },
    };
  }

  const current = await db.course.findUniqueOrThrow({ where: { id: courseId.data }, select: { certificateTemplate: true } });
  const existing = parseCertificateTemplate(current.certificateTemplate);
  for (const field of ["logoAssetId", "signatureAssetId"] as const) {
    const id = parsed.data[field];
    if (!id) continue;
    const asset = await findReadyAsset(id, AssetKind.IMAGE);
    const allowed = asset && (asset.uploadedById === user.id || existing[field] === id);
    if (!allowed) return { ok: false, result: { ok: false, message: "ไม่พบรูปภาพ", fieldErrors: { [field]: "อัปโหลดรูปใหม่อีกครั้ง" } } };
    if (!CERTIFICATE_IMAGE_MIMES.includes(asset.mime)) {
      return {
        ok: false,
        result: { ok: false, message: "ใบประกาศรับรูปเฉพาะ PNG หรือ JPEG", fieldErrors: { [field]: "ใช้ไฟล์ PNG หรือ JPEG" } },
      };
    }
  }

  return { ok: true, courseId: courseId.data, userId: user.id, template: parsed.data };
}

export async function saveCertificateTemplate(formData: FormData): Promise<ActionResult> {
  const parsed = await parseTemplateForm(formData);
  if (!parsed.ok) return parsed.result;

  const before = await db.course.findUniqueOrThrow({ where: { id: parsed.courseId }, select: { certificateTemplate: true } });
  await db.course.update({ where: { id: parsed.courseId }, data: { certificateTemplate: parsed.template } });
  await writeAudit({
    actorId: parsed.userId,
    action: "certificate.template",
    entity: "Course",
    entityId: parsed.courseId,
    before: { certificateTemplate: before.certificateTemplate ?? null },
    after: { certificateTemplate: parsed.template },
  });

  revalidatePath(`/teach/courses/${parsed.courseId}/certificate`);
  return { ok: true, message: "บันทึกแม่แบบใบประกาศแล้ว — มีผลกับใบที่ออกหลังจากนี้" };
}

/** ตัวอย่าง PDF จากค่าในฟอร์ม (ยังไม่บันทึก) — ส่ง base64 ให้ client ดาวน์โหลดเอง */
export async function previewCertificate(
  formData: FormData,
): Promise<ActionResult & { file?: { filename: string; mime: string; base64: string } }> {
  const parsed = await parseTemplateForm(formData);
  if (!parsed.ok) return parsed.result;

  const course = await db.course.findUniqueOrThrow({ where: { id: parsed.courseId }, select: { title: true } });
  const pdf = await renderFromTemplate(parsed.template, {
    name: "ชื่อ นามสกุล (ตัวอย่าง)",
    course: course.title,
    date: formatDateLong(new Date()),
    code: `LMS-${new Date().getFullYear()}-XXXXXX`,
  });
  return {
    ok: true,
    message: "สร้างตัวอย่างแล้ว",
    file: { filename: "ตัวอย่างใบประกาศ.pdf", mime: "application/pdf", base64: pdf.toString("base64") },
  };
}

/** FR-10.5 — เพิกถอนพร้อมเหตุผล (ผู้ดูแลของคณะเจ้าของคอร์สขึ้นไป) · หน้า verify แสดง "ถูกเพิกถอน" */
export async function revokeCertificate(formData: FormData): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("certificateId"));
  if (!id.success) return { ok: false, message: "ไม่พบใบประกาศ" };

  const cert = await db.certificate.findUnique({
    where: { id: id.data },
    select: { id: true, code: true, userId: true, courseId: true, revokedAt: true, course: { select: { title: true } } },
  });
  if (!cert) return { ok: false, message: "ไม่พบใบประกาศ" };
  const { user } = await assertCourseAccess(cert.courseId, "manage");
  if (cert.revokedAt) return { ok: false, message: "ใบประกาศนี้ถูกเพิกถอนไปแล้ว" };

  const parsed = revokeSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message, fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const updated = await db.certificate.updateMany({
    where: { id: cert.id, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: parsed.data.reason },
  });
  if (updated.count === 0) return { ok: false, message: "ใบประกาศนี้ถูกเพิกถอนไปแล้ว" };

  await writeAudit({
    actorId: user.id,
    action: "certificate.revoke",
    entity: "Certificate",
    entityId: cert.id,
    before: { code: cert.code, revokedAt: null },
    after: { code: cert.code, reason: parsed.data.reason },
  });
  await notify({
    userIds: [cert.userId],
    type: NotificationType.CERTIFICATE,
    title: `ใบประกาศ “${cert.course.title}” ถูกเพิกถอน`,
    body: parsed.data.reason,
    link: "/certificates",
  });

  revalidatePath("/admin/certificates");
  revalidatePath(`/verify/${cert.code}`);
  return { ok: true, message: `เพิกถอนใบประกาศ ${cert.code} แล้ว` };
}
