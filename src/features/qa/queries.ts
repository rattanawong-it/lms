import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { assertQaAccess, type QaAccess } from "@/features/qa/lib/access";
import { canEditOwn, canSee } from "@/features/qa/lib/rules";
import { QA_PAGE_SIZE, type QaFilter } from "@/features/qa/schemas";

/**
 * M13 · FR-13.1–13.3 — อ่านกระดานถาม-ตอบ
 * ทุกฟังก์ชันผ่าน `assertQaAccess()` (หรือ `teach` สำหรับกล่องคำถามของผู้สอน) ก่อน query
 */

/** รายการที่ผู้ดูคนนี้เห็นได้ — ไม่ใช่ผู้ดูแลเห็นของที่ถูกซ่อนเฉพาะของตัวเอง */
function visibleWhere(access: QaAccess): { OR?: { isHidden?: boolean; authorId?: string }[] } {
  return access.canModerate ? {} : { OR: [{ isHidden: false }, { authorId: access.user.id }] };
}

const authorSelect = { select: { id: true, name: true, image: true } } as const;

export type QaListOptions = { filter: QaFilter; lessonId: string | null; page: number };

async function listThreads(access: QaAccess, options: QaListOptions) {
  const where: Prisma.ThreadWhereInput = {
    courseId: access.course.id,
    ...visibleWhere(access),
    ...(options.lessonId ? { lessonId: options.lessonId } : {}),
    ...(options.filter === "resolved" ? { isResolved: true } : {}),
    ...(options.filter === "unanswered" ? { isResolved: false, posts: { none: { isHidden: false } } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.thread.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { lastPostAt: "desc" }],
      skip: (options.page - 1) * QA_PAGE_SIZE,
      take: QA_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        isResolved: true,
        isHidden: true,
        createdAt: true,
        lastPostAt: true,
        author: authorSelect,
        lesson: { select: { id: true, title: true } },
        _count: { select: { posts: { where: visibleWhere(access) } } },
        posts: { where: { isAnswer: true }, select: { id: true }, take: 1 },
      },
    }),
    db.thread.count({ where }),
  ]);

  const threads = rows.map(({ _count, posts, body, ...t }) => ({
    ...t,
    excerpt: body.length > 160 ? `${body.slice(0, 160)}…` : body,
    replyCount: _count.posts,
    hasAnswer: posts.length > 0,
    authorIsInstructor: access.instructorIds.includes(t.author.id),
  }));
  return { threads, total, pageCount: Math.max(1, Math.ceil(total / QA_PAGE_SIZE)) };
}

export type QaThreadListItem = Awaited<ReturnType<typeof listThreads>>["threads"][number];

/** บทเรียนของคอร์สสำหรับตัวกรอง/ตัวเลือกตอนตั้งกระทู้ */
async function courseLessons(courseId: string) {
  return db.lesson.findMany({
    where: { section: { courseId } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
    select: { id: true, title: true },
  });
}

/** `/learn/[courseId]/qa` — ผู้เรียน (รวมที่หมดอายุ) ผู้สอน และผู้ดูแล */
export async function getQaBoard(courseId: string, options: QaListOptions) {
  const access = await assertQaAccess(courseId);
  const [list, lessons] = await Promise.all([listThreads(access, options), courseLessons(courseId)]);
  return {
    course: access.course,
    canPost: access.canPost,
    canModerate: access.canModerate,
    lessons,
    ...list,
  };
}

/** `/teach/courses/[id]/qa` — กล่องคำถามของผู้สอน (ต้องมีสิทธิ์ `teach`) */
export async function getTeachQaInbox(courseId: string, options: QaListOptions) {
  await assertCourseAccess(courseId, "teach");
  return getQaBoard(courseId, options);
}

/** ส่วน "ถาม-ตอบในบทนี้" ของหน้าเรียน — กระทู้ล่าสุดของบทเรียนนั้น */
export async function getLessonQa(courseId: string, lessonId: string) {
  const access = await assertQaAccess(courseId);
  const list = await listThreads(access, { filter: "all", lessonId, page: 1 });
  return { canPost: access.canPost, threads: list.threads.slice(0, 5), total: list.total };
}

/** `/learn/[courseId]/qa/[threadId]` — กระทู้พร้อมคำตอบ (ตอบซ้อน 1 ชั้น) */
export async function getQaThread(courseId: string, threadId: string) {
  const access = await assertQaAccess(courseId);
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      courseId: true,
      authorId: true,
      title: true,
      body: true,
      isPinned: true,
      isResolved: true,
      isHidden: true,
      createdAt: true,
      editedAt: true,
      author: authorSelect,
      lesson: { select: { id: true, title: true } },
      posts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorId: true,
          parentId: true,
          body: true,
          isAnswer: true,
          isHidden: true,
          createdAt: true,
          editedAt: true,
          author: authorSelect,
        },
      },
    },
  });
  // กระทู้ของคอร์สอื่นตอบ 404 เหมือนไม่มี — ไม่ยืนยันว่ามี id นี้อยู่
  if (!thread || thread.courseId !== access.course.id || !canSee(thread, access.user.id, access)) notFound();

  const viewerId = access.user.id;
  const now = new Date();
  const visible = thread.posts.filter((p) => canSee(p, viewerId, access));
  const replyCount = (id: string) => thread.posts.filter((p) => p.parentId === id).length;

  const toPost = (p: (typeof visible)[number]) => ({
    id: p.id,
    body: p.body,
    isAnswer: p.isAnswer,
    isHidden: p.isHidden,
    createdAt: p.createdAt,
    edited: p.editedAt !== null,
    author: p.author,
    authorIsInstructor: access.instructorIds.includes(p.authorId),
    isMine: p.authorId === viewerId,
    canEdit: canEditOwn({ authorId: p.authorId, createdAt: p.createdAt, replyCount: replyCount(p.id) }, viewerId, access, now),
  });

  const posts = visible
    .filter((p) => p.parentId === null)
    .map((p) => ({ ...toPost(p), replies: visible.filter((r) => r.parentId === p.id).map(toPost) }));

  return {
    course: access.course,
    canPost: access.canPost,
    canModerate: access.canModerate,
    thread: {
      id: thread.id,
      title: thread.title,
      body: thread.body,
      isPinned: thread.isPinned,
      isResolved: thread.isResolved,
      isHidden: thread.isHidden,
      createdAt: thread.createdAt,
      edited: thread.editedAt !== null,
      author: thread.author,
      authorIsInstructor: access.instructorIds.includes(thread.authorId),
      lesson: thread.lesson,
      isMine: thread.authorId === viewerId,
      canEdit: canEditOwn({ authorId: thread.authorId, createdAt: thread.createdAt, replyCount: thread.posts.length }, viewerId, access, now),
      // ผู้ตั้งปิดกระทู้ของตัวเองได้ (FR-13.3) · ผู้ดูแลปิด/เปิดได้ทุกกระทู้
      canResolve: access.canModerate || (access.canPost && thread.authorId === viewerId),
    },
    posts,
  };
}

export type QaThreadView = Awaited<ReturnType<typeof getQaThread>>;
export type QaPostView = QaThreadView["posts"][number];
