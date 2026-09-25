"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { assertCourseAccess, requireCourseCreator } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { parseRichTextField, type RichTextDoc } from "@/lib/rich-text-doc";
import { findReadyAsset } from "@/features/uploads/service";
import {
  AssetKind,
  CourseStatus,
  InstructorRole,
  LessonType,
  Role,
  VideoSource,
  type Visibility,
} from "@/generated/prisma/enums";
import { canEditPrice, parsePriceInput } from "@/features/commerce/lib/pricing";
import {
  attachmentRemoveSchema,
  attachmentSchema,
  attachmentUpdateSchema,
  completionRuleSchema,
  courseSchema,
  courseUpdateSchema,
  instructorRemoveSchema,
  instructorSchema,
  lessonSchema,
  lessonUpdateSchema,
  reorderSchema,
  sectionSchema,
  sectionUpdateSchema,
  transitionSchema,
  type CourseTransition,
} from "@/features/courses/schemas";

/** M04 — การเขียนข้อมูลคอร์สทั้งหมด ทุกฟังก์ชันตรวจสิทธิ์ด้วย assertCourseAccess เป็นบรรทัดแรก */

function revalidateCourse(courseId: string, slug?: string) {
  revalidatePath("/teach");
  revalidatePath(`/teach/courses/${courseId}`);
  revalidatePath(`/teach/courses/${courseId}/curriculum`);
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  if (slug) revalidatePath(`/courses/${slug}`);
}

function readCourseForm(formData: FormData) {
  return {
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    level: formData.get("level"),
    visibility: formData.get("visibility"),
    enrollPolicy: formData.get("enrollPolicy"),
    sequential: formData.get("sequential") === "on" || formData.get("sequential") === "true",
    protectionEnabled:
      formData.get("protectionEnabled") === "on" ||
      formData.get("protectionEnabled") === "true",
    categoryId: formData.get("categoryId"),
    departmentId: formData.get("departmentId"),
    coverAssetId: formData.get("coverAssetId"),
  };
}

/**
 * FR-05.1 — แปลงรหัส Asset ของภาพปกเป็น object key ที่เก็บลง `Course.coverKey`
 *
 * ผู้ใช้ต้องเป็นคนอัปโหลดไฟล์นั้นเอง หรือไฟล์นั้นเป็นปกของคอร์สนี้อยู่แล้ว
 * (ผู้สอนร่วมกดบันทึกฟอร์มที่มีปกของอีกคนได้ โดยไม่เปิดให้ใครหยิบไฟล์ของคนอื่นมาใช้)
 */
async function resolveCoverKey(
  assetId: string | null,
  userId: string,
  currentKey: string | null,
): Promise<{ ok: true; key: string | null } | { ok: false; message: string }> {
  if (!assetId) return { ok: true, key: null };

  const asset = await findReadyAsset(assetId, AssetKind.IMAGE);
  if (!asset) return { ok: false, message: "ไม่พบภาพปกที่อัปโหลดไว้ กรุณาอัปโหลดใหม่" };
  if (asset.uploadedById !== userId && asset.key !== currentKey) {
    return { ok: false, message: "ไม่มีสิทธิ์ใช้ไฟล์ภาพนี้" };
  }
  return { ok: true, key: asset.key };
}

/**
 * อ่านคำอธิบายคอร์ส/เนื้อหาบทเรียนจากฟอร์ม แล้วกรองด้วย allowlist ฝั่ง server (FR-05.4)
 * เนื้อหาว่างต้องเขียนเป็น `DbNull` ไม่ใช่ `null` ของ JavaScript — ไม่งั้น Prisma
 * จะเก็บเป็นค่า JSON `null` ซึ่งคนละความหมายกับ "ไม่มีเนื้อหา"
 */
function readRichText(formData: FormData, field: string): RichTextDoc | typeof Prisma.DbNull {
  return parseRichTextField(formData.get(field)) ?? Prisma.DbNull;
}

/**
 * M18 · FR-18.1 — อ่านช่องราคา · ไม่มีช่องในฟอร์ม (ถูกล็อก) = คงราคาเดิม
 * ผู้สอนเปลี่ยนราคาได้เฉพาะคอร์สร่าง (Q3) — ราคาที่ผู้ดูแลเห็นตอนอนุมัติต้องเป็นราคาที่ขายจริง
 */
function readPrice(
  formData: FormData,
  visibility: Visibility,
  current: { price: string | null; status: CourseStatus } | null,
  isManager: boolean,
): { ok: true; price: string | null } | { ok: false; message: string } {
  const raw = formData.get("price");
  if (raw === null) return { ok: true, price: current?.price ?? null };
  const parsed = parsePriceInput(raw, visibility);
  if (!parsed.ok) return parsed;
  if (current && parsed.price !== current.price && !canEditPrice(current.status, isManager)) {
    return { ok: false, message: "คอร์สที่ส่งตรวจหรือเผยแพร่แล้ว เปลี่ยนราคาได้เฉพาะผู้ดูแล" };
  }
  return parsed;
}

/** FR-04.1 — สร้างคอร์สใหม่ (ผู้สร้างเป็นผู้สอนเจ้าของคอร์สทันที) */
export async function createCourse(
  formData: FormData,
): Promise<ActionResult & { courseId?: string }> {
  const user = await requireCourseCreator();

  const parsed = courseSchema.safeParse(readCourseForm(formData));
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const exists = await db.course.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) {
    return { ok: false, message: "slug นี้ถูกใช้แล้ว", fieldErrors: { slug: "slug นี้มีคอร์สอื่นใช้อยู่" } };
  }

  // ผู้สอนสร้างคอร์สได้เฉพาะในคณะของตน ส่วนผู้ดูแลเลือกคณะได้อิสระ (§4.1)
  const departmentId =
    user.role === Role.INSTRUCTOR ? user.departmentId : parsed.data.departmentId;

  const { coverAssetId, ...courseData } = parsed.data;

  const price = readPrice(formData, courseData.visibility, null, true);
  if (!price.ok) return { ok: false, message: price.message, fieldErrors: { price: price.message } };

  const cover = await resolveCoverKey(coverAssetId, user.id, null);
  if (!cover.ok) return { ok: false, message: cover.message };

  const created = await db.course.create({
    data: {
      ...courseData,
      price: price.price,
      coverKey: cover.key,
      description: readRichText(formData, "description"),
      departmentId,
      status: CourseStatus.DRAFT,
      instructors: { create: { userId: user.id, role: InstructorRole.OWNER } },
    },
    select: { id: true, title: true, slug: true },
  });

  await writeAudit({
    actorId: user.id,
    action: "course.create",
    entity: "Course",
    entityId: created.id,
    after: { title: created.title, slug: created.slug, price: price.price },
  });

  revalidateCourse(created.id, created.slug);
  return { ok: true, message: `สร้างคอร์ส "${created.title}" แล้ว`, courseId: created.id };
}

/** FR-04.1 — แก้ไขข้อมูลคอร์ส */
export async function updateCourse(formData: FormData): Promise<ActionResult> {
  const courseId = String(formData.get("id") ?? "");
  const access = await assertCourseAccess(courseId, "teach");

  const parsed = courseUpdateSchema.safeParse({ id: courseId, ...readCourseForm(formData) });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const { id, coverAssetId, ...data } = parsed.data;

  const before = await db.course.findUniqueOrThrow({
    where: { id },
    select: {
      title: true,
      slug: true,
      visibility: true,
      departmentId: true,
      status: true,
      coverKey: true,
      price: true,
    },
  });

  const beforePrice = before.price?.toString() ?? null;
  const price = readPrice(formData, data.visibility, { price: beforePrice, status: before.status }, access.isManager);
  if (!price.ok) return { ok: false, message: price.message, fieldErrors: { price: price.message } };

  const cover = await resolveCoverKey(coverAssetId, access.user.id, before.coverKey);
  if (!cover.ok) return { ok: false, message: cover.message };

  const duplicate = await db.course.findUnique({ where: { slug: data.slug } });
  if (duplicate && duplicate.id !== id) {
    return { ok: false, message: "slug นี้ถูกใช้แล้ว", fieldErrors: { slug: "slug นี้มีคอร์สอื่นใช้อยู่" } };
  }

  // เปลี่ยนคณะเจ้าของคอร์สได้เฉพาะผู้ดูแล เพราะมันย้ายคอร์สออกจากขอบเขตของคนอื่น
  const departmentId = access.isManager ? data.departmentId : before.departmentId;

  const after = await db.course.update({
    where: { id },
    data: {
      ...data,
      departmentId,
      price: price.price,
      coverKey: cover.key,
      description: readRichText(formData, "description"),
    },
    select: { title: true, slug: true, visibility: true, departmentId: true, price: true },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "course.update",
    entity: "Course",
    entityId: id,
    before: { ...before, price: beforePrice },
    after: { ...after, price: after.price?.toString() ?? null },
  });

  revalidateCourse(id, before.slug);
  if (after.slug !== before.slug) revalidatePath(`/courses/${after.slug}`);
  return { ok: true, message: "บันทึกข้อมูลคอร์สแล้ว" };
}

/** FR-04.7 — เงื่อนไขการจบคอร์ส */
export async function updateCompletionRule(formData: FormData): Promise<ActionResult> {
  const courseId = String(formData.get("courseId") ?? "");
  const access = await assertCourseAccess(courseId, "teach");

  const parsed = completionRuleSchema.safeParse({
    minProgress: formData.get("minProgress"),
    requireQuizPass:
      formData.get("requireQuizPass") === "on" || formData.get("requireQuizPass") === "true",
    minScore: formData.get("minScore") === "" ? null : formData.get("minScore"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  await db.course.update({ where: { id: courseId }, data: { completionRule: parsed.data } });

  await writeAudit({
    actorId: access.user.id,
    action: "course.completionRule",
    entity: "Course",
    entityId: courseId,
    after: parsed.data,
  });

  revalidateCourse(courseId);
  return { ok: true, message: "บันทึกเงื่อนไขการจบคอร์สแล้ว" };
}

// ───────────── Section ─────────────

/** FR-04.2 — เพิ่มบท (ต่อท้ายเสมอ) */
export async function createSection(formData: FormData): Promise<ActionResult> {
  const courseId = String(formData.get("courseId") ?? "");
  const access = await assertCourseAccess(courseId, "teach");

  const parsed = sectionSchema.safeParse({ courseId, title: formData.get("title") });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const last = await db.section.findFirst({
    where: { courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await db.section.create({
    data: { courseId, title: parsed.data.title, position: (last?.position ?? 0) + 1 },
    select: { id: true, title: true },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "section.create",
    entity: "Section",
    entityId: created.id,
    after: { courseId, title: created.title },
  });

  revalidateCourse(courseId);
  return { ok: true, message: `เพิ่มบท "${created.title}" แล้ว` };
}

/** FR-04.2 — เปลี่ยนชื่อบท */
export async function updateSection(formData: FormData): Promise<ActionResult> {
  const parsed = sectionUpdateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const section = await db.section.findUnique({
    where: { id: parsed.data.id },
    select: { courseId: true, title: true },
  });
  if (!section) return { ok: false, message: "ไม่พบบทที่ต้องการแก้ไข" };

  const access = await assertCourseAccess(section.courseId, "teach");
  await db.section.update({ where: { id: parsed.data.id }, data: { title: parsed.data.title } });

  await writeAudit({
    actorId: access.user.id,
    action: "section.update",
    entity: "Section",
    entityId: parsed.data.id,
    before: { title: section.title },
    after: { title: parsed.data.title },
  });

  revalidateCourse(section.courseId);
  return { ok: true, message: "เปลี่ยนชื่อบทแล้ว" };
}

/** FR-04.2 — ลบบทพร้อมบทเรียนข้างใน */
export async function deleteSection(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  const section = await db.section.findUnique({
    where: { id },
    select: { courseId: true, title: true, _count: { select: { lessons: true } } },
  });
  if (!section) return { ok: false, message: "ไม่พบบทที่ต้องการลบ" };

  const access = await assertCourseAccess(section.courseId, "teach");
  await db.section.delete({ where: { id } });

  await writeAudit({
    actorId: access.user.id,
    action: "section.delete",
    entity: "Section",
    entityId: id,
    before: { title: section.title, lessonCount: section._count.lessons },
  });

  revalidateCourse(section.courseId);
  return {
    ok: true,
    message: `ลบบท "${section.title}" พร้อมบทเรียน ${section._count.lessons} รายการแล้ว`,
  };
}

// ───────────── Lesson ─────────────

function readLessonForm(formData: FormData) {
  return {
    sectionId: String(formData.get("sectionId") ?? ""),
    title: formData.get("title"),
    type: formData.get("type"),
    isPreview: formData.get("isPreview") === "on" || formData.get("isPreview") === "true",
    videoSource: formData.get("videoSource") === "none" ? null : formData.get("videoSource"),
    videoUrl: formData.get("videoUrl"),
    durationSec: formData.get("durationSec"),
    liveUrl: formData.get("liveUrl"),
    liveStartAt: formData.get("liveStartAt"),
    liveEndAt: formData.get("liveEndAt"),
    recordingUrl: formData.get("recordingUrl"),
    assetId: formData.get("assetId"),
  };
}

type LessonData = ReturnType<typeof lessonSchema.parse>;

/**
 * FR-05.1 — ไฟล์ที่ผูกกับบทเรียน: วิดีโอที่อัปโหลดเอง (VIDEO+UPLOAD) และเอกสาร PDF
 * ใช้กติกาสิทธิ์ชุดเดียวกับภาพปก — ต้องเป็นคนอัปโหลดเอง หรือไฟล์นั้นผูกกับบทเรียนนี้อยู่แล้ว
 */
async function resolveLessonAsset(
  data: LessonData,
  userId: string,
  currentAssetId: string | null,
): Promise<{ ok: true; assetId: string | null } | { ok: false; message: string }> {
  const kind =
    data.type === LessonType.PDF
      ? AssetKind.PDF
      : data.type === LessonType.VIDEO && data.videoSource === VideoSource.UPLOAD
        ? AssetKind.VIDEO
        : null;

  // ชนิดบทเรียนที่ไม่ต้องใช้ไฟล์ → ตัดการอ้างอิงเดิมทิ้ง ไม่ให้เหลือไฟล์ค้างที่ไม่มีใครเห็น
  if (!kind || !data.assetId) return { ok: true, assetId: null };

  const asset = await findReadyAsset(data.assetId, kind);
  if (!asset) return { ok: false, message: "ไม่พบไฟล์ที่อัปโหลดไว้ กรุณาอัปโหลดใหม่" };
  if (asset.uploadedById !== userId && asset.id !== currentAssetId) {
    return { ok: false, message: "ไม่มีสิทธิ์ใช้ไฟล์นี้" };
  }
  return { ok: true, assetId: asset.id };
}

/** แปลงผลจาก schema เป็นข้อมูลที่เขียนลง Lesson โดยล้างฟิลด์ที่ไม่เกี่ยวกับชนิดนั้นทิ้ง */
function lessonWriteData(
  data: LessonData,
  extra: { assetId: string | null; content: RichTextDoc | typeof Prisma.DbNull },
) {
  const isVideo = data.type === LessonType.VIDEO;
  const isLive = data.type === LessonType.LIVE;
  const isText = data.type === LessonType.TEXT;

  return {
    title: data.title,
    type: data.type,
    isPreview: data.isPreview,
    videoSource: isVideo ? data.videoSource : null,
    videoUrl: isVideo && data.videoSource !== VideoSource.UPLOAD ? data.videoUrl : null,
    durationSec: isVideo ? data.durationSec : null,
    liveUrl: isLive ? data.liveUrl : null,
    liveStartAt: isLive ? data.liveStartAt : null,
    liveEndAt: isLive ? data.liveEndAt : null,
    recordingUrl: isLive ? data.recordingUrl : null,
    content: isText ? extra.content : Prisma.DbNull,
    assetId: extra.assetId,
  };
}

/** FR-04.3 — เพิ่มบทเรียน */
export async function createLesson(formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("sectionId") ?? "");
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { courseId: true },
  });
  if (!section) return { ok: false, message: "ไม่พบบทที่ต้องการเพิ่มบทเรียน" };

  const access = await assertCourseAccess(section.courseId, "teach");

  const parsed = lessonSchema.safeParse(readLessonForm(formData));
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const asset = await resolveLessonAsset(parsed.data, access.user.id, null);
  if (!asset.ok) return { ok: false, message: asset.message };

  const last = await db.lesson.findFirst({
    where: { sectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await db.lesson.create({
    data: {
      sectionId,
      position: (last?.position ?? 0) + 1,
      ...lessonWriteData(parsed.data, {
        assetId: asset.assetId,
        content: readRichText(formData, "content"),
      }),
    },
    select: { id: true, title: true },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.create",
    entity: "Lesson",
    entityId: created.id,
    after: { courseId: section.courseId, sectionId, title: created.title, type: parsed.data.type },
  });

  revalidateCourse(section.courseId);
  return { ok: true, message: `เพิ่มบทเรียน "${created.title}" แล้ว` };
}

/** FR-04.3 / FR-04.4 — แก้ไขบทเรียน */
export async function updateLesson(formData: FormData): Promise<ActionResult> {
  const idParsed = lessonUpdateSchema.safeParse({ id: formData.get("id") });
  if (!idParsed.success) return { ok: false, message: "ไม่พบบทเรียนที่ต้องการแก้ไข" };

  const lesson = await db.lesson.findUnique({
    where: { id: idParsed.data.id },
    select: {
      sectionId: true,
      title: true,
      type: true,
      assetId: true,
      section: { select: { courseId: true } },
    },
  });
  if (!lesson) return { ok: false, message: "ไม่พบบทเรียนที่ต้องการแก้ไข" };

  const access = await assertCourseAccess(lesson.section.courseId, "teach");

  const parsed = lessonSchema.safeParse({ ...readLessonForm(formData), sectionId: lesson.sectionId });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const asset = await resolveLessonAsset(parsed.data, access.user.id, lesson.assetId);
  if (!asset.ok) return { ok: false, message: asset.message };

  await db.lesson.update({
    where: { id: idParsed.data.id },
    data: lessonWriteData(parsed.data, {
      assetId: asset.assetId,
      content: readRichText(formData, "content"),
    }),
  });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.update",
    entity: "Lesson",
    entityId: idParsed.data.id,
    before: { title: lesson.title, type: lesson.type },
    after: { title: parsed.data.title, type: parsed.data.type },
  });

  revalidateCourse(lesson.section.courseId);
  return { ok: true, message: "บันทึกบทเรียนแล้ว" };
}

/** FR-04.2 — ลบบทเรียน */
export async function deleteLesson(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { title: true, section: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, message: "ไม่พบบทเรียนที่ต้องการลบ" };

  const access = await assertCourseAccess(lesson.section.courseId, "teach");
  await db.lesson.delete({ where: { id } });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.delete",
    entity: "Lesson",
    entityId: id,
    before: { title: lesson.title },
  });

  revalidateCourse(lesson.section.courseId);
  return { ok: true, message: `ลบบทเรียน "${lesson.title}" แล้ว` };
}

// ───────────── ไฟล์ประกอบบทเรียน (FR-05.7) ─────────────

/** หาบทเรียนพร้อมคอร์สเจ้าของ เพื่อตรวจสิทธิ์ก่อนแตะไฟล์ประกอบ */
async function lessonCourseId(lessonId: string): Promise<string | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { section: { select: { courseId: true } } },
  });
  return lesson?.section.courseId ?? null;
}

/** แนบไฟล์ประกอบเข้ากับบทเรียน — ค่าตั้งต้นคือ "ดูได้แต่ดาวน์โหลดไม่ได้" ตาม M15 */
export async function addAttachment(formData: FormData): Promise<ActionResult> {
  const parsed = attachmentSchema.safeParse({
    lessonId: formData.get("lessonId"),
    assetId: formData.get("assetId"),
    downloadable: formData.get("downloadable") === "on" || formData.get("downloadable") === "true",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const courseId = await lessonCourseId(parsed.data.lessonId);
  if (!courseId) return { ok: false, message: "ไม่พบบทเรียนที่ต้องการแนบไฟล์" };
  const access = await assertCourseAccess(courseId, "teach");

  const asset = await findReadyAsset(parsed.data.assetId, AssetKind.FILE);
  if (!asset) return { ok: false, message: "ไม่พบไฟล์ที่อัปโหลดไว้ กรุณาอัปโหลดใหม่" };
  if (asset.uploadedById !== access.user.id) {
    return { ok: false, message: "ไม่มีสิทธิ์ใช้ไฟล์นี้" };
  }

  const exists = await db.lessonAttachment.findFirst({
    where: { lessonId: parsed.data.lessonId, assetId: asset.id },
    select: { id: true },
  });
  if (exists) return { ok: false, message: "ไฟล์นี้ถูกแนบไว้แล้ว" };

  await db.lessonAttachment.create({
    data: {
      lessonId: parsed.data.lessonId,
      assetId: asset.id,
      downloadable: parsed.data.downloadable,
    },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.addAttachment",
    entity: "Lesson",
    entityId: parsed.data.lessonId,
    after: { assetId: asset.id, originalName: asset.originalName },
  });

  revalidateCourse(courseId);
  return { ok: true, message: `แนบไฟล์ ${asset.originalName} แล้ว` };
}

/** เปิด/ปิดสิทธิ์ดาวน์โหลดของไฟล์ประกอบ (FR-05.7) */
export async function setAttachmentDownloadable(formData: FormData): Promise<ActionResult> {
  const parsed = attachmentUpdateSchema.safeParse({
    id: formData.get("id"),
    downloadable: formData.get("downloadable") === "on" || formData.get("downloadable") === "true",
  });
  if (!parsed.success) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

  const attachment = await db.lessonAttachment.findUnique({
    where: { id: parsed.data.id },
    select: { lessonId: true, asset: { select: { originalName: true } } },
  });
  if (!attachment) return { ok: false, message: "ไม่พบไฟล์ประกอบ" };

  const courseId = await lessonCourseId(attachment.lessonId);
  if (!courseId) return { ok: false, message: "ไม่พบบทเรียนของไฟล์นี้" };
  const access = await assertCourseAccess(courseId, "teach");

  await db.lessonAttachment.update({
    where: { id: parsed.data.id },
    data: { downloadable: parsed.data.downloadable },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.setAttachmentDownloadable",
    entity: "Lesson",
    entityId: attachment.lessonId,
    after: { attachmentId: parsed.data.id, downloadable: parsed.data.downloadable },
  });

  revalidateCourse(courseId);
  return {
    ok: true,
    message: parsed.data.downloadable
      ? `เปิดให้ดาวน์โหลด ${attachment.asset.originalName} แล้ว`
      : `ปิดการดาวน์โหลด ${attachment.asset.originalName} แล้ว`,
  };
}

/** เอาไฟล์ประกอบออกจากบทเรียน (ตัว Asset ยังอยู่ ให้ lifecycle ของ storage จัดการต่อ) */
export async function removeAttachment(formData: FormData): Promise<ActionResult> {
  const parsed = attachmentRemoveSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

  const attachment = await db.lessonAttachment.findUnique({
    where: { id: parsed.data.id },
    select: { lessonId: true, assetId: true, asset: { select: { originalName: true } } },
  });
  if (!attachment) return { ok: false, message: "ไม่พบไฟล์ประกอบ" };

  const courseId = await lessonCourseId(attachment.lessonId);
  if (!courseId) return { ok: false, message: "ไม่พบบทเรียนของไฟล์นี้" };
  const access = await assertCourseAccess(courseId, "teach");

  await db.lessonAttachment.delete({ where: { id: parsed.data.id } });

  await writeAudit({
    actorId: access.user.id,
    action: "lesson.removeAttachment",
    entity: "Lesson",
    entityId: attachment.lessonId,
    before: { assetId: attachment.assetId, originalName: attachment.asset.originalName },
  });

  revalidateCourse(courseId);
  return { ok: true, message: `เอาไฟล์ ${attachment.asset.originalName} ออกแล้ว` };
}

/**
 * FR-04.2 — บันทึกลำดับใหม่หลังลากวาง
 * เขียนทั้งชุดใน transaction เดียว ถ้ามีรายการใดพลาดจะไม่เหลือลำดับที่ปนกัน
 */
export async function reorder(input: {
  courseId: string;
  kind: "section" | "lesson";
  ids: string[];
  sectionId?: string;
}): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "ข้อมูลการจัดลำดับไม่ถูกต้อง" };

  const { courseId, kind, ids, sectionId } = parsed.data;
  const access = await assertCourseAccess(courseId, "teach");

  if (kind === "section") {
    // ยืนยันว่าทุก id เป็นของคอร์สนี้จริง ก่อนเขียนทับลำดับ
    const owned = await db.section.count({ where: { id: { in: ids }, courseId } });
    if (owned !== ids.length) return { ok: false, message: "พบบทที่ไม่ได้อยู่ในคอร์สนี้" };

    await db.$transaction(
      ids.map((id, index) =>
        db.section.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
  } else {
    if (!sectionId) return { ok: false, message: "ไม่ทราบบทของบทเรียนที่จัดลำดับ" };

    const section = await db.section.findFirst({
      where: { id: sectionId, courseId },
      select: { id: true },
    });
    if (!section) return { ok: false, message: "พบบทที่ไม่ได้อยู่ในคอร์สนี้" };

    const owned = await db.lesson.count({ where: { id: { in: ids }, sectionId } });
    if (owned !== ids.length) return { ok: false, message: "พบบทเรียนที่ไม่ได้อยู่ในบทนี้" };

    await db.$transaction(
      ids.map((id, index) => db.lesson.update({ where: { id }, data: { position: index + 1 } })),
    );
  }

  await writeAudit({
    actorId: access.user.id,
    action: `${kind}.reorder`,
    entity: kind === "section" ? "Section" : "Lesson",
    entityId: sectionId ?? courseId,
    after: { courseId, ids },
  });

  revalidateCourse(courseId);
  return { ok: true, message: "บันทึกลำดับใหม่แล้ว" };
}

// ───────────── ผู้สอนร่วม (FR-04.5) ─────────────

/** เพิ่มผู้สอนร่วมด้วยอีเมล — ผู้ถูกเพิ่มต้องมีบทบาทผู้สอนขึ้นไปอยู่แล้ว */
export async function addInstructor(formData: FormData): Promise<ActionResult> {
  const courseId = String(formData.get("courseId") ?? "");
  const access = await assertCourseAccess(courseId, "teach");

  const parsed = instructorSchema.safeParse({ courseId, email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: "ข้อมูลไม่ถูกต้อง", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const target = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, role: true, banned: true },
  });
  if (!target) {
    return {
      ok: false,
      message: "ไม่พบผู้ใช้อีเมลนี้",
      fieldErrors: { email: "ยังไม่มีบัญชีนี้ในระบบ" },
    };
  }
  if (target.banned) {
    return { ok: false, message: "บัญชีนี้ถูกระงับอยู่", fieldErrors: { email: "บัญชีถูกระงับ" } };
  }
  if (target.role === Role.STUDENT) {
    return {
      ok: false,
      message: "ผู้ใช้นี้ยังเป็นผู้เรียน",
      fieldErrors: { email: "ต้องให้ผู้ดูแลเปลี่ยนบทบาทเป็นผู้สอนก่อน" },
    };
  }

  const exists = await db.courseInstructor.findUnique({
    where: { courseId_userId: { courseId, userId: target.id } },
    select: { userId: true },
  });
  if (exists) {
    return { ok: false, message: "ผู้ใช้นี้เป็นผู้สอนของคอร์สนี้อยู่แล้ว" };
  }

  await db.courseInstructor.create({
    data: { courseId, userId: target.id, role: InstructorRole.ASSISTANT },
  });

  await writeAudit({
    actorId: access.user.id,
    action: "course.addInstructor",
    entity: "Course",
    entityId: courseId,
    after: { userId: target.id, email: parsed.data.email },
  });

  revalidateCourse(courseId);
  return { ok: true, message: `เพิ่ม ${target.name} เป็นผู้สอนร่วมแล้ว` };
}

/** ถอดผู้สอนร่วม — ห้ามถอดจนคอร์สไม่เหลือผู้สอนเลย */
export async function removeInstructor(formData: FormData): Promise<ActionResult> {
  const parsed = instructorRemoveSchema.safeParse({
    courseId: formData.get("courseId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { ok: false, message: "ข้อมูลไม่ถูกต้อง" };

  const { courseId, userId } = parsed.data;
  const access = await assertCourseAccess(courseId, "teach");

  const count = await db.courseInstructor.count({ where: { courseId } });
  if (count <= 1) {
    return { ok: false, message: "คอร์สต้องมีผู้สอนอย่างน้อยหนึ่งคน" };
  }

  const target = await db.courseInstructor.findUnique({
    where: { courseId_userId: { courseId, userId } },
    select: { role: true, user: { select: { name: true } } },
  });
  if (!target) return { ok: false, message: "ไม่พบผู้สอนคนนี้ในคอร์ส" };

  // ผู้สอนร่วมถอดเจ้าของคอร์สไม่ได้ ต้องให้ผู้ดูแลทำ
  if (target.role === InstructorRole.OWNER && !access.isManager) {
    return { ok: false, message: "ถอดเจ้าของคอร์สได้เฉพาะผู้ดูแลคณะขึ้นไป" };
  }

  await db.courseInstructor.delete({ where: { courseId_userId: { courseId, userId } } });

  await writeAudit({
    actorId: access.user.id,
    action: "course.removeInstructor",
    entity: "Course",
    entityId: courseId,
    before: { userId, role: target.role },
  });

  revalidateCourse(courseId);
  return { ok: true, message: `ถอด ${target.user.name} ออกจากผู้สอนแล้ว` };
}

// ───────────── Workflow สถานะ (FR-04.6) ─────────────

/** สถานะปลายทางและสิทธิ์ที่ต้องมีของแต่ละการเปลี่ยนสถานะ */
const TRANSITIONS: Record<
  CourseTransition,
  { from: CourseStatus[]; to: CourseStatus; needManager: boolean; message: string }
> = {
  submit: {
    from: [CourseStatus.DRAFT],
    to: CourseStatus.PENDING_REVIEW,
    needManager: false,
    message: "ส่งคอร์สให้คณะตรวจแล้ว",
  },
  approve: {
    from: [CourseStatus.PENDING_REVIEW],
    to: CourseStatus.PUBLISHED,
    needManager: true,
    message: "อนุมัติและเผยแพร่คอร์สแล้ว",
  },
  reject: {
    from: [CourseStatus.PENDING_REVIEW],
    to: CourseStatus.DRAFT,
    needManager: true,
    message: "ส่งคอร์สกลับให้ผู้สอนแก้ไขแล้ว",
  },
  unpublish: {
    from: [CourseStatus.PUBLISHED],
    to: CourseStatus.DRAFT,
    needManager: true,
    message: "นำคอร์สออกจากการเผยแพร่แล้ว",
  },
  archive: {
    from: [CourseStatus.DRAFT, CourseStatus.PUBLISHED],
    to: CourseStatus.ARCHIVED,
    needManager: true,
    message: "เก็บคอร์สเข้าคลังแล้ว",
  },
  restore: {
    from: [CourseStatus.ARCHIVED],
    to: CourseStatus.DRAFT,
    needManager: true,
    message: "นำคอร์สกลับมาเป็นฉบับร่างแล้ว",
  },
};

/**
 * FR-04.6 — เปลี่ยนสถานะคอร์สตาม workflow
 * DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED (ผู้ดูแลคณะเป็นผู้อนุมัติ)
 */
export async function transitionCourse(formData: FormData): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse({
    courseId: formData.get("courseId"),
    transition: formData.get("transition"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, message: "คำสั่งเปลี่ยนสถานะไม่ถูกต้อง" };

  const { courseId, transition, note } = parsed.data;
  const rule = TRANSITIONS[transition];

  const access = await assertCourseAccess(courseId, rule.needManager ? "manage" : "teach");

  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: {
      status: true,
      slug: true,
      title: true,
      sections: { select: { _count: { select: { lessons: true } } } },
    },
  });

  if (!rule.from.includes(course.status)) {
    return { ok: false, message: `คอร์สอยู่ในสถานะ ${course.status} จึงทำรายการนี้ไม่ได้` };
  }

  // กันเผยแพร่คอร์สเปล่า — ผู้เรียนกดเข้ามาแล้วไม่มีอะไรให้เรียน
  if (rule.to === CourseStatus.PUBLISHED || transition === "submit") {
    const lessonCount = course.sections.reduce((sum, s) => sum + s._count.lessons, 0);
    if (lessonCount === 0) {
      return { ok: false, message: "คอร์สยังไม่มีบทเรียน จึงยังส่งตรวจหรือเผยแพร่ไม่ได้" };
    }
  }

  await db.course.update({
    where: { id: courseId },
    data: {
      status: rule.to,
      // จำวันเผยแพร่ครั้งแรกไว้ ไม่รีเซ็ตเมื่อนำออกแล้วเผยแพร่ใหม่
      ...(rule.to === CourseStatus.PUBLISHED ? { publishedAt: new Date() } : {}),
    },
  });

  await writeAudit({
    actorId: access.user.id,
    action: `course.${transition}`,
    entity: "Course",
    entityId: courseId,
    before: { status: course.status },
    after: { status: rule.to, note },
  });

  revalidateCourse(courseId, course.slug);
  return { ok: true, message: rule.message };
}
