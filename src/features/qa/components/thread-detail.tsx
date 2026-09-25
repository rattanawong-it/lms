"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  CircleCheckBig,
  EyeOff,
  Loader2,
  Pencil,
  Pin,
  Reply,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/shared/field";
import type { ActionResult } from "@/lib/action-result";
import { formatDateTime } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import {
  deletePost,
  deleteThread,
  editPost,
  editThread,
  replyToThread,
  setBestAnswer,
  setPostHidden,
  setThreadHidden,
  setThreadPinned,
  setThreadResolved,
} from "@/features/qa/actions";
import { QA_BODY_MAX, QA_TITLE_MAX } from "@/features/qa/schemas";
import type { QaPostView, QaThreadView } from "@/features/qa/queries";
import { PlainText } from "@/features/qa/components/plain-text";
import { QaTextarea } from "@/features/qa/components/qa-textarea";

type Action = (formData: FormData) => Promise<ActionResult>;
type Run = (action: Action, formData: FormData, after?: () => void) => void;

const RunContext = React.createContext<{ run: Run; pending: boolean } | null>(null);

function useRun() {
  const ctx = React.useContext(RunContext);
  if (!ctx) throw new Error("useRun ต้องอยู่ใน <ThreadDetail>");
  return ctx;
}

/** ปุ่มเดียวที่ส่ง id + ค่าเปิดปิด ไปยัง action */
function FlagButton({
  action,
  id,
  value,
  children,
}: {
  action: Action;
  id: string;
  value?: boolean;
  children: React.ReactNode;
}) {
  const { run, pending } = useRun();
  return (
    <form onSubmit={submitForm((fd) => run(action, fd))}>
      <input type="hidden" name="id" value={id} />
      {value === undefined ? null : <input type="hidden" name="value" value={String(value)} />}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {children}
      </Button>
    </form>
  );
}

function DeleteButton({ action, id, what }: { action: Action; id: string; what: "กระทู้" | "คำตอบ" }) {
  const { run, pending } = useRun();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" /> ลบ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบ{what}นี้?</DialogTitle>
            <DialogDescription>
              {what === "กระทู้" ? "คำตอบทั้งหมดในกระทู้จะถูกลบไปด้วย" : "คำตอบย่อยของคำตอบนี้จะถูกลบไปด้วย"} ·
              ระบบเก็บสำเนาไว้ในบันทึกการใช้งานเพื่อตรวจสอบย้อนหลัง
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm((fd) => run(action, fd, () => setOpen(false)))}>
            <input type="hidden" name="id" value={id} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ลบ{what}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Byline({
  author,
  authorIsInstructor,
  createdAt,
  edited,
}: {
  author: { name: string };
  authorIsInstructor: boolean;
  createdAt: Date;
  edited: boolean;
}) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
      <span className="text-foreground font-medium">{author.name}</span>
      {authorIsInstructor ? (
        <Badge variant="secondary" className="bg-info-bg text-info-fg">
          ผู้สอน
        </Badge>
      ) : null}
      <span>· {formatDateTime(createdAt)}</span>
      {edited ? <span>· แก้ไขแล้ว</span> : null}
    </p>
  );
}

function ReplyForm({
  threadId,
  parentId,
  label,
  onDone,
  autoFocus,
}: {
  threadId: string;
  parentId?: string;
  label: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { run, pending } = useRun();
  const [formKey, setFormKey] = React.useState(0);
  const [error, setError] = React.useState<string>();
  return (
    <form
      key={formKey}
      aria-label={label}
      onSubmit={submitForm((fd) =>
        run(
          async (data) => {
            const result = await replyToThread(data);
            setError(result.ok ? undefined : result.fieldErrors?.body);
            return result;
          },
          fd,
          () => {
            setFormKey((k) => k + 1);
            onDone?.();
          },
        ),
      )}
      className="space-y-2"
    >
      <input type="hidden" name="threadId" value={threadId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <QaTextarea
        label={label}
        hideLabel
        name="body"
        rows={parentId ? 3 : 4}
        maxLength={QA_BODY_MAX}
        placeholder="เขียนคำตอบ · วางลิงก์ได้ (ข้อความล้วน)"
        error={error}
        autoFocus={autoFocus}
      />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            ยกเลิก
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          ส่งคำตอบ
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  id,
  title,
  body,
  onDone,
}: {
  id: string;
  title?: string;
  body: string;
  onDone: () => void;
}) {
  const { run, pending } = useRun();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const action = title === undefined ? editPost : editThread;
  return (
    <form
      aria-label="แก้ไขข้อความ"
      className="space-y-3"
      onSubmit={submitForm((fd) =>
        run(
          async (data) => {
            const result = await action(data);
            setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
            return result;
          },
          fd,
          onDone,
        ),
      )}
    >
      <input type="hidden" name="id" value={id} />
      {title === undefined ? null : (
        <Field label="หัวข้อคำถาม" name="title" defaultValue={title} maxLength={QA_TITLE_MAX} required error={errors.title} />
      )}
      <QaTextarea label="ข้อความ" name="body" rows={4} maxLength={QA_BODY_MAX} defaultValue={body} error={errors.body} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          บันทึก
        </Button>
      </div>
    </form>
  );
}

function PostItem({
  post,
  threadId,
  canPost,
  canModerate,
  isReply = false,
}: {
  post: QaPostView | QaPostView["replies"][number];
  threadId: string;
  canPost: boolean;
  canModerate: boolean;
  isReply?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);

  return (
    <article
      id={`post-${post.id}`}
      data-qa-post
      data-answer={post.isAnswer || undefined}
      aria-label={`คำตอบของ ${post.author.name}`}
      className={
        post.isAnswer
          ? "border-success-fg/40 bg-success-bg/40 scroll-mt-24 rounded-xl border p-4"
          : "bg-card border-border scroll-mt-24 rounded-xl border p-4"
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {post.isAnswer ? (
          <Badge variant="secondary" className="bg-success-bg text-success-fg">
            <Award className="size-3" aria-hidden /> คำตอบที่ดีที่สุด
          </Badge>
        ) : null}
        {post.isHidden ? (
          <Badge variant="secondary" className="bg-warning-bg text-warning-fg">
            <EyeOff className="size-3" aria-hidden /> ถูกซ่อน
          </Badge>
        ) : null}
        <Byline {...post} />
      </div>

      <div className="mt-2">
        {editing ? (
          <EditForm id={post.id} body={post.body} onDone={() => setEditing(false)} />
        ) : (
          <PlainText text={post.body} />
        )}
      </div>

      {editing ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {canPost ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setReplying((v) => !v)}>
              <Reply className="size-3.5" /> ตอบกลับ
            </Button>
          ) : null}
          {canModerate && !isReply ? (
            <FlagButton action={setBestAnswer} id={post.id} value={!post.isAnswer}>
              <Award className="size-3.5" /> {post.isAnswer ? "ยกเลิกคำตอบที่ดีที่สุด" : "เลือกเป็นคำตอบที่ดีที่สุด"}
            </FlagButton>
          ) : null}
          {post.canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> แก้ไข
            </Button>
          ) : null}
          {canModerate ? (
            <FlagButton action={setPostHidden} id={post.id} value={!post.isHidden}>
              <EyeOff className="size-3.5" /> {post.isHidden ? "เลิกซ่อน" : "ซ่อน"}
            </FlagButton>
          ) : null}
          {post.canEdit || canModerate ? <DeleteButton action={deletePost} id={post.id} what="คำตอบ" /> : null}
        </div>
      )}

      {replying ? (
        <div className="mt-3">
          <ReplyForm
            threadId={threadId}
            parentId={post.id}
            label={`ตอบกลับ ${post.author.name}`}
            onDone={() => setReplying(false)}
            autoFocus
          />
        </div>
      ) : null}

      {"replies" in post && post.replies.length > 0 ? (
        <div className="border-line mt-4 space-y-3 border-l-2 pl-3 sm:pl-4">
          {post.replies.map((reply) => (
            <PostItem
              key={reply.id}
              post={reply}
              threadId={threadId}
              canPost={canPost}
              canModerate={canModerate}
              isReply
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** M13 · FR-13.1–13.3 — กระทู้ + คำตอบ (ตอบซ้อน 1 ชั้น) + ปุ่มของเจ้าของ/ผู้ดูแล */
export function ThreadDetail({ data, courseId }: { data: QaThreadView; courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const { thread, posts, canPost, canModerate } = data;

  const run: Run = React.useCallback(
    (action, formData, after) => {
      startTransition(async () => {
        const result = await action(formData);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        after?.();
        // ลบกระทู้แล้วหน้านี้ไม่มีอยู่ — กลับไปหน้ารายการ
        if (action === deleteThread) router.push(`/learn/${courseId}/qa`);
        else router.refresh();
      });
    },
    [router, courseId],
  );

  const replyCount = posts.reduce((n, p) => n + 1 + p.replies.length, 0);
  const canReply = canPost && (!thread.isHidden || canModerate);

  return (
    <RunContext.Provider value={{ run, pending }}>
      <article aria-labelledby="qa-thread-title" className="bg-card border-border rounded-xl border p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {thread.isPinned ? (
            <Badge variant="secondary" className="bg-info-bg text-info-fg">
              <Pin className="size-3" aria-hidden /> ปักหมุด
            </Badge>
          ) : null}
          {thread.isResolved ? (
            <Badge variant="secondary" data-qa-resolved className="bg-success-bg text-success-fg">
              <CircleCheckBig className="size-3" aria-hidden /> แก้ไขแล้ว
            </Badge>
          ) : null}
          {thread.isHidden ? (
            <Badge variant="secondary" className="bg-warning-bg text-warning-fg">
              <EyeOff className="size-3" aria-hidden /> ถูกซ่อน — ผู้เรียนคนอื่นไม่เห็น
            </Badge>
          ) : null}
        </div>

        {editing ? (
          <EditForm id={thread.id} title={thread.title} body={thread.body} onDone={() => setEditing(false)} />
        ) : (
          <>
            <h1 id="qa-thread-title" className="text-[20px] leading-snug font-bold tracking-[-0.015em] break-words">
              {thread.title}
            </h1>
            <div className="mt-1.5">
              <Byline {...thread} />
              {thread.lesson ? (
                <p className="text-muted-foreground mt-0.5 text-[12.5px]">บทเรียน: {thread.lesson.title}</p>
              ) : null}
            </div>
            <PlainText text={thread.body} className="mt-3" />
          </>
        )}

        {editing ? null : (
          <div className="mt-4 flex flex-wrap gap-2">
            {thread.canResolve ? (
              <FlagButton action={setThreadResolved} id={thread.id} value={!thread.isResolved}>
                <CircleCheckBig className="size-3.5" /> {thread.isResolved ? "เปิดกระทู้อีกครั้ง" : "ปิดว่าแก้ไขแล้ว"}
              </FlagButton>
            ) : null}
            {thread.canEdit ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> แก้ไข
              </Button>
            ) : null}
            {canModerate ? (
              <>
                <FlagButton action={setThreadPinned} id={thread.id} value={!thread.isPinned}>
                  <Pin className="size-3.5" /> {thread.isPinned ? "เลิกปักหมุด" : "ปักหมุด"}
                </FlagButton>
                <FlagButton action={setThreadHidden} id={thread.id} value={!thread.isHidden}>
                  <EyeOff className="size-3.5" /> {thread.isHidden ? "เลิกซ่อน" : "ซ่อน"}
                </FlagButton>
              </>
            ) : null}
            {thread.canEdit || canModerate ? <DeleteButton action={deleteThread} id={thread.id} what="กระทู้" /> : null}
          </div>
        )}
      </article>

      <section aria-labelledby="qa-answers" className="mt-6 space-y-3">
        <h2 id="qa-answers" className="text-[15px] font-semibold">
          คำตอบ ({replyCount})
        </h2>
        {posts.length === 0 ? (
          <p className="text-muted-foreground bg-card border-border rounded-xl border px-4 py-6 text-center text-[13px]">
            ยังไม่มีคำตอบ
          </p>
        ) : (
          posts.map((post) => (
            <PostItem key={post.id} post={post} threadId={thread.id} canPost={canReply} canModerate={canModerate} />
          ))
        )}
      </section>

      <section aria-label="เขียนคำตอบ" className="bg-card border-border mt-6 rounded-xl border p-4 sm:p-5">
        {canReply ? (
          <ReplyForm threadId={thread.id} label="เขียนคำตอบ" />
        ) : (
          <p className="text-muted-foreground text-[13px]">
            {canPost ? "กระทู้นี้ถูกซ่อนแล้ว ตอบเพิ่มไม่ได้" : "สิทธิ์เรียนคอร์สนี้หมดอายุแล้ว — อ่านกระทู้ได้แต่ตอบไม่ได้"}
          </p>
        )}
      </section>
    </RunContext.Provider>
  );
}
