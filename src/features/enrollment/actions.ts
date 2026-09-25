"use server";

import { revalidatePath } from "next/cache";
import { isPaidCourse } from "@/features/commerce/lib/pricing";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import {
  notifyCourseCompleted,
  writeProgress,
  type ProgressTarget,
} from "@/features/enrollment/lib/progress-writer";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import {
  CourseStatus,
  EnrollPolicy,
  EnrollmentSource,
  EnrollmentStatus,
  LessonType,
  NotificationType,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { reachedVideoCompletion } from "@/features/enrollment/lib/progress";
import { getLessonAccess, type LessonAccess } from "@/features/enrollment/queries";
import {
  bulkEnrollSchema,
  decisionSchema,
  dropSchema,
  enrollSchema,
  expirySchema,
  markCompleteSchema,
  saveProgressSchema,
} from "@/features/enrollment/schemas";

/**
 * M06 — การเขียนข้อมูลการลงทะเบียนและความคืบหน้า
 *
 * ทุกฟังก์ชันตรวจสิทธิ์ก่อนแตะข้อมูล และคำนวณ `Enrollment.progressPct` ใหม่
 * ภายใน transaction เดียวกับที่แก้ `LessonProgress` เสมอ (system-design §3.3)
 */

/** ชน unique constraint (เช่น [userId, courseId] ของ Enrollment) */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function revalidateLearner(courseId: string, slug?: string) {
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath(`/learn/${courseId}`);
  if (slug) revalidatePath(`/courses/${slug}`);
}

function revalidateRoster(courseId: string) {
  revalidatePath(`/teach/courses/${courseId}/students`);
}

/* ────────────────────────── FR-06.1 ลงทะเบียน ────────────────────────── */

/**
 * FR-06.1 — ผู้เรียนกดลงทะเบียนด้วยตัวเอง
 *
 * `OPEN` เข้าเรียนได้ทันที · `APPROVAL` สร้างคำขอสถานะ PENDING ให้ผู้สอนตัดสิน
 * · `INVITE_ONLY` สมัครเองไม่ได้ ต้องให้ผู้ดูแลเพิ่มให้ (FR-06.2)
 */
export async function enroll(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = enrollSchema.safeParse({ courseId: formData.get("courseId") });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { courseId } = parsed.data;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      enrollPolicy: true,
      visibility: true,
      price: true,
      instructors: { select: { userId: true } },
    },
  });
  if (!course) return { ok: false, message: "ไม่พบคอร์สที่ต้องการลงทะเบียน" };

  // M18 — คอร์สที่มีราคาได้สิทธิ์เรียนจากการชำระเงินสำเร็จเท่านั้น (หรือผู้ดูแลเพิ่มให้) · deny by default แม้ยิง action ตรง
  if (isPaidCourse(course)) {
    return { ok: false, message: "คอร์สนี้ต้องชำระเงินก่อนเรียน" };
  }

  // คอร์สที่ยังไม่เผยแพร่เปิดให้ผู้สอนดูหน้ารายละเอียดได้ แต่ไม่ควรลงทะเบียนได้
  if (course.status !== CourseStatus.PUBLISHED) {
    return { ok: false, message: "คอร์สนี้ยังไม่เปิดให้ลงทะเบียน" };
  }

  if (course.enrollPolicy === EnrollPolicy.INVITE_ONLY) {
    return {
      ok: false,
      message: "คอร์สนี้รับเฉพาะผู้ที่ได้รับเชิญ กรุณาติดต่อผู้สอนหรือคณะที่เปิดสอน",
    };
  }

  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { id: true, status: true, expiresAt: true },
  });

  const approval = course.enrollPolicy === EnrollPolicy.APPROVAL;
  const nextStatus = approval ? EnrollmentStatus.PENDING : EnrollmentStatus.ACTIVE;

  let enrollmentId = existing?.id ?? null;

  if (existing) {
    const stillValid =
      existing.status === EnrollmentStatus.ACTIVE &&
      (existing.expiresAt === null || existing.expiresAt > new Date());

    if (stillValid) return { ok: false, message: "คุณลงทะเบียนคอร์สนี้ไว้แล้ว" };
    if (existing.status === EnrollmentStatus.PENDING) {
      return { ok: false, message: "คำขอของคุณอยู่ระหว่างรออนุมัติ" };
    }
    if (existing.status === EnrollmentStatus.COMPLETED) {
      return { ok: false, message: "คุณเรียนคอร์สนี้จบแล้ว" };
    }

    // หมดอายุหรือเคยถอนไป — เปิดสิทธิ์ใหม่โดยคงความคืบหน้าเดิมไว้
    await db.enrollment.update({
      where: { id: existing.id },
      data: { status: nextStatus, expiresAt: null, enrolledAt: new Date() },
    });
  } else {
    try {
      const created = await db.enrollment.create({
        data: {
          userId: user.id,
          courseId,
          status: nextStatus,
          source: EnrollmentSource.SELF,
        },
        select: { id: true },
      });
      enrollmentId = created.id;
    } catch (error) {
      // กดปุ่มสองครั้งพร้อมกัน (หรือสองแท็บ) — อีกคำขอสร้างแถวไปแล้ว
      // unique [userId, courseId] กันข้อมูลซ้ำให้แล้ว เหลือแค่ตอบให้ตรงกับความจริง
      if (isUniqueViolation(error)) {
        return { ok: false, message: "คุณลงทะเบียนคอร์สนี้ไว้แล้ว" };
      }
      throw error;
    }
  }

  await writeAudit({
    actorId: user.id,
    action: approval ? "enrollment.request" : "enrollment.create",
    entity: "Enrollment",
    entityId: enrollmentId,
    after: { courseId, status: nextStatus, source: EnrollmentSource.SELF },
  });

  if (approval) {
    await notify({
      userIds: course.instructors.map((i) => i.userId),
      type: NotificationType.ENROLLED,
      title: `มีคำขอลงทะเบียนใหม่ในคอร์ส ${course.title}`,
      body: `${user.name} ขอเข้าเรียนคอร์สนี้`,
      link: `/teach/courses/${courseId}/students`,
    });
  } else {
    await notify({
      userIds: [user.id],
      type: NotificationType.ENROLLED,
      title: `ลงทะเบียนคอร์ส ${course.title} สำเร็จ`,
      link: `/learn/${courseId}`,
    });
  }

  revalidateLearner(courseId, course.slug);
  revalidateRoster(courseId);

  return {
    ok: true,
    message: approval
      ? "ส่งคำขอลงทะเบียนแล้ว รอผู้สอนอนุมัติ"
      : "ลงทะเบียนสำเร็จ เริ่มเรียนได้เลย",
  };
}

/** ผู้เรียนยกเลิกคำขอที่ยังรออนุมัติของตัวเอง */
export async function cancelEnrollRequest(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = dropSchema.safeParse({ enrollmentId: formData.get("enrollmentId") });
  if (!parsed.success) return { ok: false, message: "ไม่พบคำขอลงทะเบียน" };

  const enrollment = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { id: true, userId: true, courseId: true, status: true, course: { select: { slug: true } } },
  });

  if (!enrollment || enrollment.userId !== user.id) {
    return { ok: false, message: "ไม่พบคำขอลงทะเบียน" };
  }
  if (enrollment.status !== EnrollmentStatus.PENDING) {
    return { ok: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว" };
  }

  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { status: EnrollmentStatus.DROPPED },
  });

  await writeAudit({
    actorId: user.id,
    action: "enrollment.cancel",
    entity: "Enrollment",
    entityId: enrollment.id,
    before: { status: EnrollmentStatus.PENDING },
    after: { status: EnrollmentStatus.DROPPED },
  });

  revalidateLearner(enrollment.courseId, enrollment.course.slug);
  revalidateRoster(enrollment.courseId);

  return { ok: true, message: "ยกเลิกคำขอลงทะเบียนแล้ว" };
}

/** FR-06.1 — ผู้สอน/ผู้ดูแลอนุมัติหรือปฏิเสธคำขอลงทะเบียน */
export async function decideEnrollment(formData: FormData): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const enrollment = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: {
      id: true,
      courseId: true,
      userId: true,
      status: true,
      course: { select: { title: true, slug: true } },
    },
  });
  if (!enrollment) return { ok: false, message: "ไม่พบคำขอลงทะเบียน" };

  // ตรวจสิทธิ์จากคอร์สที่ค้นเจอจริง ไม่ใช่จาก courseId ที่ client ส่งมา
  const access = await assertCourseAccess(enrollment.courseId, "teach");

  if (enrollment.status !== EnrollmentStatus.PENDING) {
    return { ok: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว" };
  }

  const approved = parsed.data.decision === "approve";
  const status = approved ? EnrollmentStatus.ACTIVE : EnrollmentStatus.DROPPED;

  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { status, enrolledAt: approved ? new Date() : undefined },
  });

  await writeAudit({
    actorId: access.user.id,
    action: approved ? "enrollment.approve" : "enrollment.reject",
    entity: "Enrollment",
    entityId: enrollment.id,
    before: { status: EnrollmentStatus.PENDING },
    after: { status },
  });

  await notify({
    userIds: [enrollment.userId],
    type: NotificationType.ENROLLED,
    title: approved
      ? `คำขอเรียนคอร์ส ${enrollment.course.title} ได้รับอนุมัติแล้ว`
      : `คำขอเรียนคอร์ส ${enrollment.course.title} ไม่ได้รับอนุมัติ`,
    link: approved ? `/learn/${enrollment.courseId}` : `/courses/${enrollment.course.slug}`,
  });

  revalidateLearner(enrollment.courseId, enrollment.course.slug);
  revalidateRoster(enrollment.courseId);

  return { ok: true, message: approved ? "อนุมัติคำขอแล้ว" : "ปฏิเสธคำขอแล้ว" };
}

/* ────────────────────────── FR-06.2 ลงทะเบียนกลุ่ม ────────────────────────── */

/**
 * FR-06.2 — ผู้สอน/ผู้ดูแลเพิ่มผู้เรียนเป็นกลุ่ม พร้อมกำหนดวันหมดสิทธิ์
 *
 * รับได้ทั้งรายการอีเมลที่พิมพ์เองและเนื้อหาไฟล์ CSV ที่วางลงมาทั้งก้อน
 * อีเมลที่ยังไม่มีบัญชีในระบบจะถูกรายงานกลับ ไม่สร้างบัญชีให้เอง (นำเข้าผู้ใช้เป็นงานของ FR-02.5)
 */
export async function bulkEnroll(formData: FormData): Promise<ActionResult> {
  const parsed = bulkEnrollSchema.safeParse({
    courseId: formData.get("courseId"),
    emails: formData.get("emails"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const { courseId, emails, expiresAt } = parsed.data;

  const access = await assertCourseAccess(courseId, "teach");

  const users = await db.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  const notFoundEmails = emails.filter((email) => !idByEmail.has(email));
  const userIds = [...idByEmail.values()];

  if (userIds.length === 0) {
    return {
      ok: false,
      message: "ไม่พบผู้ใช้ตามอีเมลที่กรอก — ต้องมีบัญชีในระบบก่อนจึงลงทะเบียนให้ได้",
      fieldErrors: { emails: `ไม่พบบัญชีของ ${notFoundEmails.slice(0, 5).join(", ")}` },
    };
  }

  const existing = await db.enrollment.findMany({
    where: { courseId, userId: { in: userIds } },
    select: { id: true, userId: true, status: true },
  });
  const existingByUser = new Map(existing.map((e) => [e.userId, e]));

  const toCreate = userIds.filter((id) => !existingByUser.has(id));
  const toReactivate = existing.filter((e) => e.status !== EnrollmentStatus.ACTIVE);

  await db.$transaction([
    ...(toCreate.length > 0
      ? [
          db.enrollment.createMany({
            data: toCreate.map((userId) => ({
              userId,
              courseId,
              status: EnrollmentStatus.ACTIVE,
              source: EnrollmentSource.IMPORT,
              expiresAt,
            })),
          }),
        ]
      : []),
    ...(toReactivate.length > 0
      ? [
          db.enrollment.updateMany({
            where: { id: { in: toReactivate.map((e) => e.id) } },
            data: { status: EnrollmentStatus.ACTIVE, expiresAt },
          }),
        ]
      : []),
    // ผู้ที่ยัง ACTIVE อยู่แล้วได้รับผลแค่วันหมดสิทธิ์ที่ตั้งใหม่
    ...(expiresAt !== null
      ? [
          db.enrollment.updateMany({
            where: { courseId, userId: { in: userIds }, status: EnrollmentStatus.ACTIVE },
            data: { expiresAt },
          }),
        ]
      : []),
  ]);

  await writeAudit({
    actorId: access.user.id,
    action: "enrollment.bulk",
    entity: "Course",
    entityId: courseId,
    after: {
      created: toCreate.length,
      reactivated: toReactivate.length,
      notFound: notFoundEmails,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { title: true, slug: true },
  });

  await notify({
    userIds: [...toCreate, ...toReactivate.map((e) => e.userId)],
    type: NotificationType.ENROLLED,
    title: `คุณถูกเพิ่มเข้าคอร์ส ${course?.title ?? ""}`.trim(),
    link: `/learn/${courseId}`,
  });

  revalidateLearner(courseId, course?.slug);
  revalidateRoster(courseId);

  const added = toCreate.length + toReactivate.length;
  const skipped = userIds.length - added;
  const parts = [`เพิ่มผู้เรียน ${added} คน`];
  if (skipped > 0) parts.push(`ลงทะเบียนอยู่แล้ว ${skipped} คน`);
  if (notFoundEmails.length > 0) parts.push(`ไม่พบบัญชี ${notFoundEmails.length} อีเมล`);

  return { ok: true, message: parts.join(" · ") };
}

/** FR-06.2 — แก้วันหมดสิทธิ์เรียนของผู้เรียนรายคน */
export async function setEnrollmentExpiry(formData: FormData): Promise<ActionResult> {
  const parsed = expirySchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const enrollment = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { id: true, courseId: true, expiresAt: true, course: { select: { slug: true } } },
  });
  if (!enrollment) return { ok: false, message: "ไม่พบการลงทะเบียน" };

  const access = await assertCourseAccess(enrollment.courseId, "teach");

  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { expiresAt: parsed.data.expiresAt },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "enrollment.expiry",
    entity: "Enrollment",
    entityId: enrollment.id,
    before: { expiresAt: enrollment.expiresAt?.toISOString() ?? null },
    after: { expiresAt: parsed.data.expiresAt?.toISOString() ?? null },
  });

  revalidateLearner(enrollment.courseId, enrollment.course.slug);
  revalidateRoster(enrollment.courseId);

  return {
    ok: true,
    message: parsed.data.expiresAt ? "บันทึกวันหมดสิทธิ์แล้ว" : "ยกเลิกวันหมดสิทธิ์แล้ว",
  };
}

/** ถอนผู้เรียนออกจากคอร์ส — ใช้ DROPPED แทนการลบ เพื่อให้ความคืบหน้าเดิมยังอยู่ */
export async function removeEnrollment(formData: FormData): Promise<ActionResult> {
  const parsed = dropSchema.safeParse({ enrollmentId: formData.get("enrollmentId") });
  if (!parsed.success) return { ok: false, message: "ไม่พบการลงทะเบียน" };

  const enrollment = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { id: true, courseId: true, status: true, course: { select: { slug: true } } },
  });
  if (!enrollment) return { ok: false, message: "ไม่พบการลงทะเบียน" };

  const access = await assertCourseAccess(enrollment.courseId, "teach");

  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { status: EnrollmentStatus.DROPPED },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "enrollment.remove",
    entity: "Enrollment",
    entityId: enrollment.id,
    before: { status: enrollment.status },
    after: { status: EnrollmentStatus.DROPPED },
  });

  revalidateLearner(enrollment.courseId, enrollment.course.slug);
  revalidateRoster(enrollment.courseId);

  return { ok: true, message: "ถอนผู้เรียนออกจากคอร์สแล้ว" };
}

/* ────────────────────────── FR-06.3–06.5 ความคืบหน้า ────────────────────────── */

/**
 * ด่านตรวจสิทธิ์ของบทเรียนย้ายไปอยู่ที่ `getLessonAccess()` ใน queries.ts
 * เพราะเส้นทางไฟล์วิดีโอ/PDF (M05 · FR-15.7) ต้องใช้ด่านเดียวกันนี้
 */
type LessonContext = LessonAccess;

/** แปลงบริบทของบทเรียนเป็นเป้าหมายของตัวเขียนความคืบหน้า (`lib/progress-writer.ts`) */
function targetOf(ctx: LessonContext & { enrollmentId: string }): ProgressTarget {
  return {
    enrollmentId: ctx.enrollmentId,
    userId: ctx.userId,
    courseId: ctx.courseId,
    completionRule: ctx.completionRule,
    totalLessons: ctx.lessons.length,
  };
}

/**
 * FR-06.3/06.4 — บันทึกตำแหน่งวิดีโอล่าสุด เรียกทุก 15 วินาทีและตอนหยุดเล่น
 *
 * ไม่เขียน AuditLog เพราะเรียกถี่มาก (จะกลบ log อื่นทั้งหมด) และไม่ revalidate
 * เพราะเป็นการ ping เบื้องหลัง ไม่ได้ทำให้หน้าที่ผู้ใช้มองอยู่เปลี่ยน
 */
export async function saveProgress(input: {
  lessonId: string;
  positionSec: number;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = saveProgressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "ข้อมูลความคืบหน้าไม่ถูกต้อง" };

  const ctx = await getLessonAccess(parsed.data.lessonId);
  if (!ctx) return { ok: false, message: "ไม่พบบทเรียน" };

  // ผู้สอน/ผู้ดูแลที่เปิดดูหน้าเรียนไม่มี enrollment — ดูได้แต่ไม่บันทึกความคืบหน้า
  if (!ctx.enrollmentId) return { ok: true, message: "ดูในฐานะผู้สอน ไม่บันทึกความคืบหน้า" };
  if (!ctx.unlocked) {
    return { ok: false, message: "ต้องเรียนบทก่อนหน้าให้จบก่อน" };
  }

  const alreadyCompleted = ctx.lessons.find((l) => l.id === parsed.data.lessonId)?.completed;
  const autoComplete =
    !alreadyCompleted && reachedVideoCompletion(parsed.data.positionSec, ctx.lesson.durationSec);

  const result = await writeProgress(targetOf({ ...ctx, enrollmentId: ctx.enrollmentId }), parsed.data.lessonId, {
    lastPositionSec: parsed.data.positionSec,
    ...(autoComplete ? { completed: true } : {}),
  });

  if (autoComplete) {
    await writeAudit({
      actorId: null,
      action: "progress.autocomplete",
      entity: "LessonProgress",
      entityId: parsed.data.lessonId,
      after: { progressPct: result.progressPct },
    });
    // ดูวิดีโอจนจบบทสุดท้ายก็ทำให้จบคอร์สได้ — แจ้งเตือน + ออกใบประกาศเหมือนปุ่มเรียนจบ
    await notifyCourseCompleted(result, ctx.userId);
    revalidateLearner(ctx.courseId, ctx.slug);
  }

  return { ok: true, message: "บันทึกความคืบหน้าแล้ว" };
}

/** FR-06.3 — ผู้เรียนกด "เรียนจบบทนี้" หรือยกเลิกการทำเครื่องหมาย */
export async function markLessonComplete(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = markCompleteSchema.safeParse({
    lessonId: formData.get("lessonId"),
    completed: formData.get("completed") !== "false",
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const ctx = await getLessonAccess(parsed.data.lessonId);
  if (!ctx) return { ok: false, message: "ไม่พบบทเรียน" };
  if (!ctx.enrollmentId) {
    return { ok: false, message: "คุณกำลังดูในฐานะผู้สอน จึงไม่บันทึกความคืบหน้า" };
  }
  if (!ctx.unlocked) {
    return { ok: false, message: "ต้องเรียนบทก่อนหน้าให้จบก่อน" };
  }

  // บทแบบทดสอบนับว่าจบเมื่อสอบผ่านเท่านั้น (M07) — ติ๊กเองไม่ได้ ทั้งติ๊กจบและยกเลิก
  if (ctx.lesson.type === LessonType.QUIZ) {
    const quiz = await db.quiz.findUnique({ where: { lessonId: ctx.lesson.id }, select: { id: true } });
    if (quiz) return { ok: false, message: "บทนี้จะนับว่าเรียนจบเมื่อสอบผ่านแบบทดสอบ" };
  }
  // บทงานที่ต้องส่งนับว่าจบเมื่อส่งงาน (M08)
  if (ctx.lesson.type === LessonType.ASSIGNMENT) {
    const assignment = await db.assignment.findUnique({ where: { lessonId: ctx.lesson.id }, select: { id: true } });
    if (assignment) return { ok: false, message: "บทนี้จะนับว่าเรียนจบเมื่อส่งงาน" };
  }

  const result = await writeProgress(
    targetOf({ ...ctx, enrollmentId: ctx.enrollmentId }),
    parsed.data.lessonId,
    { completed: parsed.data.completed },
  );

  await writeAudit({
    actorId: user.id,
    action: parsed.data.completed ? "progress.complete" : "progress.uncomplete",
    entity: "LessonProgress",
    entityId: parsed.data.lessonId,
    after: { courseId: ctx.courseId, progressPct: result.progressPct },
  });

  await notifyCourseCompleted(result, user.id);

  revalidateLearner(ctx.courseId, ctx.slug);
  revalidateRoster(ctx.courseId);

  return {
    ok: true,
    message: result.courseCompleted
      ? "เรียนจบคอร์สนี้แล้ว ยินดีด้วย"
      : parsed.data.completed
        ? `บันทึกแล้ว · ความคืบหน้า ${result.progressPct}%`
        : "ยกเลิกการทำเครื่องหมายแล้ว",
  };
}
