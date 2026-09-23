"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser, type SessionUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { parseRichTextField } from "@/lib/rich-text-doc";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import {
  AnnouncementScope,
  EnrollmentStatus,
  NotificationType,
} from "@/generated/prisma/enums";
import {
  announcementIdSchema,
  createAnnouncementSchema,
  pinAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas";
import {
  announcementLink,
  canPostOrgAnnouncement,
} from "@/features/announcements/lib/audience";

/**
 * M11 · FR-11.1 — เผยแพร่ แก้ ปักหมุด และลบประกาศ
 *
 * สิทธิ์ตัดสินจากระดับของประกาศ (§4.1): ระดับคอร์สใช้ `assertCourseAccess(…, "teach")`
 * ระดับทั้งระบบ/คณะใช้ `canPostOrgAnnouncement()` · การแก้/ลบ/ปักหมุดตรวจกับค่าที่อยู่ใน DB
 * ไม่ใช่ค่าที่ฟอร์มส่งมา
 */

type Target = {
  scope: AnnouncementScope;
  departmentId: string | null;
  courseId: string | null;
};

const DENIED: ActionResult = { ok: false, message: "คุณไม่มีสิทธิ์จัดการประกาศในระดับนี้" };

/** ตรวจสิทธิ์ต่อกลุ่มผู้รับ — คืน `null` เมื่อผ่าน */
async function authorizeTarget(user: SessionUser, target: Target): Promise<ActionResult | null> {
  if (target.scope === AnnouncementScope.COURSE) {
    if (!target.courseId) return DENIED;
    await assertCourseAccess(target.courseId, "teach");
    return null;
  }
  return canPostOrgAnnouncement(user, target.scope, target.departmentId) ? null : DENIED;
}

/**
 * ผู้รับการแจ้งเตือน — ไม่รวมผู้ประกาศเอง และไม่รวมบัญชีที่ถูกระงับ
 * ระดับคอร์สส่งถึงผู้เรียนที่ยังมีสิทธิ์เรียนอยู่จริงเท่านั้น (เทียบ `expiresAt` เอง)
 */
async function recipientIds(target: Target, authorId: string): Promise<string[]> {
  if (target.scope === AnnouncementScope.COURSE) {
    const rows = await db.enrollment.findMany({
      where: {
        courseId: target.courseId!,
        status: EnrollmentStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: { banned: false },
        userId: { not: authorId },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  const rows = await db.user.findMany({
    where: {
      banned: false,
      id: { not: authorId },
      ...(target.scope === AnnouncementScope.DEPARTMENT
        ? { departmentId: target.departmentId! }
        : {}),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function revalidateAnnouncements(courseId: string | null) {
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  revalidatePath("/admin/announcements");
  if (courseId) revalidatePath(`/teach/courses/${courseId}/announcements`);
}

export async function createAnnouncement(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = createAnnouncementSchema.safeParse({
    scope: formData.get("scope"),
    departmentId: formData.get("departmentId"),
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    pinned: formData.get("pinned"),
  });
  const body = parseRichTextField(formData.get("body"));

  if (!parsed.success || !body) {
    return {
      ok: false,
      message: "กรุณาตรวจสอบข้อมูลประกาศอีกครั้ง",
      fieldErrors: {
        ...(parsed.success ? {} : zodToFieldErrors(parsed.error)),
        ...(body ? {} : { body: "กรุณาเขียนเนื้อหาประกาศ" }),
      },
    };
  }

  // เก็บเฉพาะ id ที่ตรงกับระดับ — ประกาศทั้งระบบต้องไม่ติดคณะหรือคอร์สมาด้วย
  const target: Target = {
    scope: parsed.data.scope,
    departmentId:
      parsed.data.scope === AnnouncementScope.DEPARTMENT ? parsed.data.departmentId : null,
    courseId: parsed.data.scope === AnnouncementScope.COURSE ? parsed.data.courseId : null,
  };

  const denied = await authorizeTarget(user, target);
  if (denied) return denied;

  // ชื่อต้นทางใช้เป็นเนื้อความของการแจ้งเตือน และยืนยันว่าคณะ/คอร์สมีอยู่จริง
  let source = "มหาวิทยาลัยเกริก";
  if (target.departmentId) {
    const department = await db.department.findUnique({
      where: { id: target.departmentId },
      select: { name: true },
    });
    if (!department) {
      return { ok: false, message: "ไม่พบคณะที่เลือก", fieldErrors: { departmentId: "ไม่พบคณะที่เลือก" } };
    }
    source = department.name;
  } else if (target.courseId) {
    const course = await db.course.findUniqueOrThrow({
      where: { id: target.courseId },
      select: { title: true },
    });
    source = course.title;
  }

  const announcement = await db.announcement.create({
    data: {
      ...target,
      authorId: user.id,
      title: parsed.data.title,
      body,
      pinned: parsed.data.pinned,
    },
    select: { id: true },
  });

  const sent = await notify({
    userIds: await recipientIds(target, user.id),
    type: NotificationType.ANNOUNCEMENT,
    title: `ประกาศ: ${parsed.data.title}`,
    body: source,
    link: announcementLink(announcement.id),
  });

  await writeAudit({
    actorId: user.id,
    action: "announcement.create",
    entity: "Announcement",
    entityId: announcement.id,
    after: { ...target, title: parsed.data.title, pinned: parsed.data.pinned, notified: sent },
  });

  revalidateAnnouncements(target.courseId);
  return {
    ok: true,
    message:
      sent > 0 ? `เผยแพร่ประกาศแล้ว · แจ้งเตือนผู้รับ ${sent.toLocaleString("th-TH")} คน` : "เผยแพร่ประกาศแล้ว",
  };
}

/** โหลดประกาศพร้อมกลุ่มผู้รับที่บันทึกไว้ แล้วตรวจสิทธิ์ตามค่านั้น */
async function loadForWrite(user: SessionUser, id: string) {
  const existing = await db.announcement.findUnique({
    where: { id },
    select: { id: true, scope: true, departmentId: true, courseId: true, title: true, pinned: true },
  });
  if (!existing) return { error: { ok: false, message: "ไม่พบประกาศ" } as ActionResult };

  const denied = await authorizeTarget(user, existing);
  if (denied) return { error: denied };
  return { existing };
}

export async function updateAnnouncement(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateAnnouncementSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    pinned: formData.get("pinned"),
  });
  const body = parseRichTextField(formData.get("body"));

  if (!parsed.success || !body) {
    return {
      ok: false,
      message: "กรุณาตรวจสอบข้อมูลประกาศอีกครั้ง",
      fieldErrors: {
        ...(parsed.success ? {} : zodToFieldErrors(parsed.error)),
        ...(body ? {} : { body: "กรุณาเขียนเนื้อหาประกาศ" }),
      },
    };
  }

  const { existing, error } = await loadForWrite(user, parsed.data.id);
  if (error) return error;

  // แก้แล้วไม่แจ้งเตือนซ้ำ — ผู้รับเห็นเนื้อหาใหม่เมื่อเปิดลิงก์เดิม
  await db.announcement.update({
    where: { id: existing.id },
    data: { title: parsed.data.title, body, pinned: parsed.data.pinned },
  });

  await writeAudit({
    actorId: user.id,
    action: "announcement.update",
    entity: "Announcement",
    entityId: existing.id,
    before: { title: existing.title, pinned: existing.pinned },
    after: { title: parsed.data.title, pinned: parsed.data.pinned },
  });

  revalidateAnnouncements(existing.courseId);
  return { ok: true, message: "บันทึกการแก้ไขประกาศแล้ว" };
}

export async function setAnnouncementPinned(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = pinAnnouncementSchema.safeParse({
    id: formData.get("id"),
    pinned: formData.get("pinned"),
  });
  if (!parsed.success) return { ok: false, message: "ไม่พบประกาศ" };

  const { existing, error } = await loadForWrite(user, parsed.data.id);
  if (error) return error;

  await db.announcement.update({
    where: { id: existing.id },
    data: { pinned: parsed.data.pinned },
  });

  await writeAudit({
    actorId: user.id,
    action: "announcement.pin",
    entity: "Announcement",
    entityId: existing.id,
    before: { pinned: existing.pinned },
    after: { pinned: parsed.data.pinned },
  });

  revalidateAnnouncements(existing.courseId);
  return { ok: true, message: parsed.data.pinned ? "ปักหมุดประกาศแล้ว" : "เลิกปักหมุดประกาศแล้ว" };
}

export async function deleteAnnouncement(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = announcementIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "ไม่พบประกาศ" };

  const { existing, error } = await loadForWrite(user, parsed.data.id);
  if (error) return error;

  // ลบการแจ้งเตือนที่ชี้มาที่ประกาศนี้ไปด้วย ไม่ให้เหลือลิงก์ที่เปิดแล้วไม่เจออะไร
  await db.$transaction([
    db.notification.deleteMany({
      where: { type: NotificationType.ANNOUNCEMENT, link: announcementLink(existing.id) },
    }),
    db.announcement.delete({ where: { id: existing.id } }),
  ]);

  await writeAudit({
    actorId: user.id,
    action: "announcement.delete",
    entity: "Announcement",
    entityId: existing.id,
    before: {
      scope: existing.scope,
      departmentId: existing.departmentId,
      courseId: existing.courseId,
      title: existing.title,
    },
  });

  revalidateAnnouncements(existing.courseId);
  return { ok: true, message: "ลบประกาศแล้ว" };
}
