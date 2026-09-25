"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { zodToFieldErrors, type ActionResult } from "@/lib/action-result";
import { NotificationType } from "@/generated/prisma/enums";
import { assertQaAccess, type QaAccess } from "@/features/qa/lib/access";
import { canEditOwn, canSee, replyParentId, replyRecipients } from "@/features/qa/lib/rules";
import {
  createThreadSchema,
  editPostSchema,
  editThreadSchema,
  qaFlagSchema,
  qaIdSchema,
  replySchema,
} from "@/features/qa/schemas";

/**
 * M13 · FR-13.1–13.4 — ตั้งกระทู้ ตอบ แก้ ลบ และงานของผู้ดูแล
 *
 * action ที่รับ id ของกระทู้/คำตอบย้อนหาคอร์สจาก id นั้นแล้วตรวจสิทธิ์ตามคอร์สที่เจอจริง (CLAUDE.md §5)
 * ลบโดยผู้ดูแล = ลบจริง แต่เก็บสำเนาข้อความไว้ใน AuditLog เป็นหลักฐาน
 */

const NOT_FOUND: ActionResult = { ok: false, message: "ไม่พบรายการนี้ หรืออาจถูกลบไปแล้ว" };
const READ_ONLY: ActionResult = { ok: false, message: "สิทธิ์เรียนคอร์สนี้หมดอายุแล้ว อ่านได้อย่างเดียว" };
const NOT_MODERATOR: ActionResult = { ok: false, message: "เฉพาะผู้สอนหรือผู้ดูแลคอร์สเท่านั้น" };
const EDIT_CLOSED: ActionResult = {
  ok: false,
  message: "แก้ไขหรือลบได้ภายใน 15 นาทีหลังโพสต์ และก่อนมีคนตอบเท่านั้น",
};

/** กันการโพสต์ถี่ ๆ (สแปม) — กระทู้และคำตอบรวมกัน 10 ครั้ง/10 นาทีต่อผู้ใช้ */
function postQuotaExceeded(userId: string): ActionResult | null {
  const limit = rateLimit(`qa:${userId}`, { windowSec: 600, max: 10 });
  if (limit.ok) return null;
  return { ok: false, message: `คุณโพสต์ถี่เกินไป กรุณารออีก ${Math.ceil(limit.retryAfterSec / 60)} นาที` };
}

const threadLink = (courseId: string, threadId: string) => `/learn/${courseId}/qa/${threadId}`;

function revalidateQa(courseId: string, threadId?: string, lessonId?: string | null) {
  revalidatePath(`/learn/${courseId}/qa`);
  revalidatePath(`/teach/courses/${courseId}/qa`);
  if (threadId) revalidatePath(threadLink(courseId, threadId));
  if (lessonId) revalidatePath(`/learn/${courseId}/${lessonId}`);
}

function invalid(error: Parameters<typeof zodToFieldErrors>[0]): ActionResult {
  return { ok: false, message: "กรุณาตรวจสอบข้อมูลอีกครั้ง", fieldErrors: zodToFieldErrors(error) };
}

/** กระทู้ + สิทธิ์ตามคอร์สของกระทู้จริง · มองไม่เห็น (ถูกซ่อน) = ไม่พบ */
async function threadContext(threadId: string) {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      courseId: true,
      lessonId: true,
      authorId: true,
      title: true,
      body: true,
      isHidden: true,
      isPinned: true,
      isResolved: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });
  if (!thread) return null;
  const access = await assertQaAccess(thread.courseId);
  if (!canSee(thread, access.user.id, access)) return null;
  return { thread, access };
}

async function postContext(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      threadId: true,
      parentId: true,
      authorId: true,
      body: true,
      isHidden: true,
      isAnswer: true,
      createdAt: true,
      _count: { select: { replies: true } },
      thread: { select: { courseId: true, lessonId: true, isHidden: true, authorId: true } },
    },
  });
  if (!post) return null;
  const access = await assertQaAccess(post.thread.courseId);
  if (!canSee(post, access.user.id, access) || !canSee({ ...post.thread }, access.user.id, access)) return null;
  return { post, access };
}

// ───────────── ผู้เรียน/ผู้สอน: ตั้งกระทู้ ตอบ แก้ ลบของตัวเอง ─────────────

export async function createThread(formData: FormData): Promise<ActionResult & { threadId?: string }> {
  const parsed = createThreadSchema.safeParse({
    courseId: formData.get("courseId"),
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const access = await assertQaAccess(parsed.data.courseId);
  if (!access.canPost) return READ_ONLY;

  const { courseId, lessonId, title, body } = parsed.data;
  if (lessonId) {
    const lesson = await db.lesson.findFirst({ where: { id: lessonId, section: { courseId } }, select: { id: true } });
    if (!lesson) return { ok: false, message: "ไม่พบบทเรียนที่เลือก", fieldErrors: { lessonId: "ไม่พบบทเรียนที่เลือก" } };
  }
  const quota = postQuotaExceeded(access.user.id);
  if (quota) return quota;

  const thread = await db.thread.create({
    data: { courseId, lessonId, authorId: access.user.id, title, body },
    select: { id: true },
  });
  await writeAudit({ actorId: access.user.id, action: "qa.thread.create", entity: "Thread", entityId: thread.id, after: { courseId, lessonId, title } });

  // FR-13.4 — คำถามใหม่แจ้งผู้สอนทุกคนของคอร์ส (ยกเว้นผู้ตั้งเอง)
  await notify({
    userIds: access.instructorIds.filter((id) => id !== access.user.id),
    type: NotificationType.QA_REPLY,
    title: `คำถามใหม่ในคอร์ส “${access.course.title}”`,
    body: `${access.user.name}: ${title}`,
    link: threadLink(courseId, thread.id),
  });

  revalidateQa(courseId, thread.id, lessonId);
  return { ok: true, message: "ตั้งคำถามแล้ว", threadId: thread.id };
}

export async function replyToThread(formData: FormData): Promise<ActionResult> {
  const parsed = replySchema.safeParse({
    threadId: formData.get("threadId"),
    parentId: formData.get("parentId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await threadContext(parsed.data.threadId);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  if (!access.canPost) return READ_ONLY;
  if (thread.isHidden && !access.canModerate) return { ok: false, message: "กระทู้นี้ถูกซ่อนแล้ว ตอบเพิ่มไม่ได้" };

  // ตอบคำตอบ → ผูกกับคำตอบระดับบนสุดของกระทู้เดียวกันเท่านั้น
  let parent: { id: string; authorId: string } | null = null;
  if (parsed.data.parentId) {
    const target = await db.post.findFirst({
      where: { id: parsed.data.parentId, threadId: thread.id },
      select: { id: true, parentId: true, authorId: true, isHidden: true },
    });
    if (!target || !canSee(target, access.user.id, access)) return NOT_FOUND;
    // ผูกกับคำตอบระดับบนสุด แต่แจ้งเจ้าของคำตอบที่ถูกกดตอบจริง (อาจเป็นคำตอบย่อย)
    parent = { id: replyParentId(target), authorId: target.authorId };
  }

  const quota = postQuotaExceeded(access.user.id);
  if (quota) return quota;

  const now = new Date();
  const post = await db.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: { threadId: thread.id, parentId: parent?.id ?? null, authorId: access.user.id, body: parsed.data.body },
      select: { id: true },
    });
    await tx.thread.update({ where: { id: thread.id }, data: { lastPostAt: now } });
    return created;
  });
  await writeAudit({ actorId: access.user.id, action: "qa.post.create", entity: "Post", entityId: post.id, after: { threadId: thread.id, parentId: parent?.id ?? null } });

  await notify({
    userIds: replyRecipients({ threadAuthorId: thread.authorId, parentAuthorId: parent?.authorId ?? null, actorId: access.user.id }),
    type: NotificationType.QA_REPLY,
    title: `${access.user.name} ตอบในกระทู้ “${thread.title}”`,
    body: parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body,
    link: `${threadLink(thread.courseId, thread.id)}#post-${post.id}`,
  });

  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: "ส่งคำตอบแล้ว" };
}

export async function editThread(formData: FormData): Promise<ActionResult> {
  const parsed = editThreadSchema.safeParse({ id: formData.get("id"), title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await threadContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  if (!canEditOwn({ ...thread, replyCount: thread._count.posts }, access.user.id, access)) return EDIT_CLOSED;

  await db.thread.update({
    where: { id: thread.id },
    data: { title: parsed.data.title, body: parsed.data.body, editedAt: new Date() },
  });
  await writeAudit({
    actorId: access.user.id,
    action: "qa.thread.update",
    entity: "Thread",
    entityId: thread.id,
    before: { title: thread.title, body: thread.body },
    after: { title: parsed.data.title, body: parsed.data.body },
  });
  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: "บันทึกการแก้ไขแล้ว" };
}

export async function editPost(formData: FormData): Promise<ActionResult> {
  const parsed = editPostSchema.safeParse({ id: formData.get("id"), body: formData.get("body") });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await postContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { post, access } = ctx;
  if (!canEditOwn({ ...post, replyCount: post._count.replies }, access.user.id, access)) return EDIT_CLOSED;

  await db.post.update({ where: { id: post.id }, data: { body: parsed.data.body, editedAt: new Date() } });
  await writeAudit({
    actorId: access.user.id,
    action: "qa.post.update",
    entity: "Post",
    entityId: post.id,
    before: { body: post.body },
    after: { body: parsed.data.body },
  });
  revalidateQa(post.thread.courseId, post.threadId, post.thread.lessonId);
  return { ok: true, message: "บันทึกการแก้ไขแล้ว" };
}

/**
 * ลบกระทู้ — เจ้าของ (ภายในเวลาที่แก้ได้) หรือผู้ดูแล (ได้ทุกเมื่อ)
 * เก็บสำเนาไว้ใน AuditLog ก่อนลบ (คำตอบทั้งหมดของกระทู้ถูกลบตาม)
 */
export async function deleteThread(formData: FormData): Promise<ActionResult> {
  const parsed = qaIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await threadContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  const own = canEditOwn({ ...thread, replyCount: thread._count.posts }, access.user.id, access);
  if (!own && !access.canModerate) return EDIT_CLOSED;

  await db.thread.delete({ where: { id: thread.id } });
  await writeAudit({
    actorId: access.user.id,
    action: "qa.thread.delete",
    entity: "Thread",
    entityId: thread.id,
    before: { courseId: thread.courseId, authorId: thread.authorId, title: thread.title, body: thread.body, replies: thread._count.posts, byModerator: !own },
  });
  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: "ลบกระทู้แล้ว" };
}

export async function deletePost(formData: FormData): Promise<ActionResult> {
  const parsed = qaIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await postContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { post, access } = ctx;
  const own = canEditOwn({ ...post, replyCount: post._count.replies }, access.user.id, access);
  if (!own && !access.canModerate) return EDIT_CLOSED;

  await db.post.delete({ where: { id: post.id } });
  await writeAudit({
    actorId: access.user.id,
    action: "qa.post.delete",
    entity: "Post",
    entityId: post.id,
    before: { threadId: post.threadId, authorId: post.authorId, body: post.body, replies: post._count.replies, byModerator: !own },
  });
  revalidateQa(post.thread.courseId, post.threadId, post.thread.lessonId);
  return { ok: true, message: "ลบคำตอบแล้ว" };
}

/** ปิด/เปิดกระทู้ว่า "แก้ไขแล้ว" — ผู้ตั้ง (ที่ยังโพสต์ได้) หรือผู้ดูแล */
export async function setThreadResolved(formData: FormData): Promise<ActionResult> {
  const parsed = qaFlagSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await threadContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  const isOwner = access.canPost && thread.authorId === access.user.id;
  if (!isOwner && !access.canModerate) return NOT_MODERATOR;

  await db.thread.update({ where: { id: thread.id }, data: { isResolved: parsed.data.value } });
  await audit(access, "qa.thread.resolve", "Thread", thread.id, { isResolved: thread.isResolved }, { isResolved: parsed.data.value });
  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: parsed.data.value ? "ปิดกระทู้ว่าแก้ไขแล้ว" : "เปิดกระทู้อีกครั้ง" };
}

// ───────────── ผู้สอน/ผู้ดูแล ─────────────

async function audit(
  access: QaAccess,
  action: string,
  entity: "Thread" | "Post",
  entityId: string,
  before: Record<string, boolean>,
  after: Record<string, boolean>,
) {
  await writeAudit({ actorId: access.user.id, action, entity, entityId, before, after });
}

export async function setThreadPinned(formData: FormData): Promise<ActionResult> {
  const parsed = qaFlagSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await threadContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  if (!access.canModerate) return NOT_MODERATOR;

  await db.thread.update({ where: { id: thread.id }, data: { isPinned: parsed.data.value } });
  await audit(access, "qa.thread.pin", "Thread", thread.id, { isPinned: thread.isPinned }, { isPinned: parsed.data.value });
  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: parsed.data.value ? "ปักหมุดกระทู้แล้ว" : "เลิกปักหมุดแล้ว" };
}

export async function setThreadHidden(formData: FormData): Promise<ActionResult> {
  const parsed = qaFlagSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await threadContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { thread, access } = ctx;
  if (!access.canModerate) return NOT_MODERATOR;

  await db.thread.update({ where: { id: thread.id }, data: { isHidden: parsed.data.value } });
  await audit(access, "qa.thread.hide", "Thread", thread.id, { isHidden: thread.isHidden }, { isHidden: parsed.data.value });
  revalidateQa(thread.courseId, thread.id, thread.lessonId);
  return { ok: true, message: parsed.data.value ? "ซ่อนกระทู้แล้ว — ผู้เรียนคนอื่นจะไม่เห็น" : "เลิกซ่อนกระทู้แล้ว" };
}

export async function setPostHidden(formData: FormData): Promise<ActionResult> {
  const parsed = qaFlagSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await postContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { post, access } = ctx;
  if (!access.canModerate) return NOT_MODERATOR;

  await db.post.update({ where: { id: post.id }, data: { isHidden: parsed.data.value } });
  await audit(access, "qa.post.hide", "Post", post.id, { isHidden: post.isHidden }, { isHidden: parsed.data.value });
  revalidateQa(post.thread.courseId, post.threadId, post.thread.lessonId);
  return { ok: true, message: parsed.data.value ? "ซ่อนคำตอบแล้ว" : "เลิกซ่อนคำตอบแล้ว" };
}

/**
 * FR-13.3 — เลือก "คำตอบที่ดีที่สุด" (1 อันต่อกระทู้) · เลือกแล้วปิดกระทู้ว่าแก้ไขแล้วด้วย
 * ยกเลิกการเลือกไม่เปิดกระทู้กลับ (ผู้ดูแลเปิดเองได้)
 */
export async function setBestAnswer(formData: FormData): Promise<ActionResult> {
  const parsed = qaFlagSchema.safeParse({ id: formData.get("id"), value: formData.get("value") });
  if (!parsed.success) return NOT_FOUND;

  const ctx = await postContext(parsed.data.id);
  if (!ctx) return NOT_FOUND;
  const { post, access } = ctx;
  if (!access.canModerate) return NOT_MODERATOR;

  await db.$transaction(async (tx) => {
    if (parsed.data.value) {
      await tx.post.updateMany({ where: { threadId: post.threadId, isAnswer: true }, data: { isAnswer: false } });
      await tx.thread.update({ where: { id: post.threadId }, data: { isResolved: true } });
    }
    await tx.post.update({ where: { id: post.id }, data: { isAnswer: parsed.data.value } });
  });
  await audit(access, "qa.post.answer", "Post", post.id, { isAnswer: post.isAnswer }, { isAnswer: parsed.data.value });
  revalidateQa(post.thread.courseId, post.threadId, post.thread.lessonId);
  return { ok: true, message: parsed.data.value ? "เลือกเป็นคำตอบที่ดีที่สุดแล้ว" : "ยกเลิกคำตอบที่ดีที่สุดแล้ว" };
}
