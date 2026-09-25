"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import { RatingStars } from "@/features/catalog/components/course-card";
import { replyToReview, setReviewHidden } from "@/features/reviews/actions";
import { REVIEW_REPLY_MAX } from "@/features/reviews/schemas";
import type { CourseReviewItem } from "@/features/reviews/queries";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (action: (fd: FormData) => Promise<ActionResult>, fd: FormData, after?: () => void) =>
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      after?.();
      router.refresh();
    });
  return { run, pending };
}

function ReplyForm({ review, onDone }: { review: CourseReviewItem; onDone: () => void }) {
  const { run, pending } = useRun();
  const id = React.useId();
  return (
    <form
      aria-label="ตอบกลับรีวิว"
      onSubmit={submitForm((fd) => run(replyToReview, fd, onDone))}
      className="mt-3 space-y-2"
    >
      <input type="hidden" name="id" value={review.id} />
      <label htmlFor={id} className="sr-only">
        คำตอบกลับของผู้สอน
      </label>
      <textarea
        id={id}
        name="reply"
        rows={3}
        maxLength={REVIEW_REPLY_MAX}
        defaultValue={review.reply ?? ""}
        placeholder="ตอบกลับผู้รีวิว (เว้นว่างแล้วบันทึก = ลบคำตอบกลับ)"
        className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          บันทึกคำตอบกลับ
        </Button>
      </div>
    </form>
  );
}

/** ปุ่มซ่อน/เลิกซ่อนรีวิว — ใช้ทั้งในหน้าคอร์สและ `/admin/reviews` */
export function HideReviewButton({ id, hidden }: { id: string; hidden: boolean }) {
  const { run, pending } = useRun();
  return (
    <form onSubmit={submitForm((fd) => run(setReviewHidden, fd))}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="value" value={String(!hidden)} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="min-h-11">
        <EyeOff className="size-3.5" /> {hidden ? "เลิกซ่อน" : "ซ่อนรีวิว"}
      </Button>
    </form>
  );
}

function ReviewItem({
  review,
  canReply,
  canModerate,
}: {
  review: CourseReviewItem;
  canReply: boolean;
  canModerate: boolean;
}) {
  const [replying, setReplying] = React.useState(false);
  return (
    <li
      id={`review-${review.id}`}
      data-review
      className="bg-card border-border scroll-mt-24 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span role="img" aria-label={`${review.rating} ดาว`}>
          <RatingStars value={review.rating} />
        </span>
        <span className="text-[13px] font-medium">{review.authorName}</span>
        {review.isMine ? (
          <Badge variant="secondary" className="bg-info-bg text-info-fg">
            รีวิวของคุณ
          </Badge>
        ) : null}
        {review.isHidden ? (
          <Badge variant="secondary" className="bg-warning-bg text-warning-fg">
            <EyeOff className="size-3" aria-hidden /> ถูกซ่อน — ไม่นับในค่าเฉลี่ย
          </Badge>
        ) : null}
        <span className="text-muted-foreground num text-[12px]">{formatDate(review.createdAt)}</span>
      </div>
      {review.comment ? (
        <p className="text-fg-2 mt-2 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">
          {review.comment}
        </p>
      ) : null}

      {review.reply && !replying ? (
        <div data-review-reply className="bg-muted/60 mt-3 rounded-lg px-3.5 py-2.5">
          <p className="text-[12px] font-semibold">
            คำตอบจากผู้สอน
            {review.repliedAt ? (
              <span className="text-muted-foreground num ml-1.5 font-normal">{formatDate(review.repliedAt)}</span>
            ) : null}
          </p>
          <p className="text-fg-2 mt-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap">{review.reply}</p>
        </div>
      ) : null}

      {replying ? <ReplyForm review={review} onDone={() => setReplying(false)} /> : null}

      {(canReply || canModerate) && !replying ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canReply ? (
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setReplying(true)}>
              <MessageSquareReply className="size-3.5" /> {review.reply ? "แก้คำตอบกลับ" : "ตอบกลับ"}
            </Button>
          ) : null}
          {canModerate ? <HideReviewButton id={review.id} hidden={review.isHidden} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/** FR-14.2–14.3 — รายการรีวิว + ตอบกลับ (ผู้สอน) + ซ่อน (ผู้ดูแล) */
export function ReviewList({
  reviews,
  canReply,
  canModerate,
}: {
  reviews: CourseReviewItem[];
  canReply: boolean;
  canModerate: boolean;
}) {
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <ReviewItem key={r.id} review={r} canReply={canReply} canModerate={canModerate} />
      ))}
    </ul>
  );
}
