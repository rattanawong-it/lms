"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cancelEnrollRequest, enroll } from "@/features/enrollment/actions";
import { ENROLL_POLICY_HINT } from "@/features/enrollment/lib/labels";
import type { EnrollmentStateKind } from "@/features/enrollment/queries";
import { EnrollPolicy } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { submitForm } from "@/lib/form";

/**
 * M06 · FR-06.1 — แผงลงทะเบียนบนหน้ารายละเอียดคอร์ส
 *
 * ปุ่มที่เห็นขึ้นกับสองอย่าง: นโยบายของคอร์ส และสถานะการลงทะเบียนของผู้ใช้คนนี้
 * ทุกกรณียังถูกตรวจซ้ำใน `enroll()` ฝั่ง server — ปุ่มนี้เป็นแค่การบอกล่วงหน้า
 */
export function EnrollPanel({
  courseId,
  enrollPolicy,
  state,
  enrollmentId,
  progressPct,
  expiresAt,
  canTeach,
}: {
  courseId: string;
  enrollPolicy: EnrollPolicy;
  state: EnrollmentStateKind;
  enrollmentId: string | null;
  progressPct: number;
  expiresAt: Date | null;
  /** ผู้สอน/ผู้ดูแลของคอร์สนี้ — เข้าหน้าเรียนได้โดยไม่ต้องลงทะเบียน */
  canTeach: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const learnHref = `/learn/${courseId}`;

  if (canTeach && state !== "active" && state !== "completed") {
    return (
      <>
        <Button asChild className="w-full" size="lg" variant="outline">
          <Link href={learnHref}>ดูหน้าเรียนของผู้เรียน</Link>
        </Button>
        <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
          คุณเป็นผู้สอนหรือผู้ดูแลของคอร์สนี้ จึงเข้าดูได้โดยไม่ต้องลงทะเบียน
          และความคืบหน้าจะไม่ถูกบันทึก
        </p>
      </>
    );
  }

  if (state === "active" || state === "completed") {
    const done = state === "completed";
    return (
      <>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-muted-foreground">ความคืบหน้า</span>
            <span className="num font-medium">{progressPct}%</span>
          </div>
          <Progress
            value={progressPct}
            aria-label={`เรียนไปแล้ว ${progressPct} เปอร์เซ็นต์`}
          />
        </div>

        <Button asChild className="w-full" size="lg">
          <Link href={learnHref}>{done ? "ทบทวนบทเรียน" : "เรียนต่อ"}</Link>
        </Button>

        {done ? (
          <p className="text-success-fg flex items-center justify-center gap-1.5 text-center text-[12px] font-medium">
            <CircleCheckBig className="size-4" /> คุณเรียนคอร์สนี้จบแล้ว
          </p>
        ) : expiresAt ? (
          <p className="text-muted-foreground text-center text-[11.5px]">
            เรียนได้ถึง {formatDate(expiresAt)}
          </p>
        ) : null}
      </>
    );
  }

  if (state === "pending") {
    return (
      <>
        <Button className="w-full" size="lg" variant="outline" disabled>
          รอผู้สอนอนุมัติ
        </Button>
        {enrollmentId ? (
          <form onSubmit={submitForm((formData) => run(() => cancelEnrollRequest(formData)))}>
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground w-full"
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              ยกเลิกคำขอ
            </Button>
          </form>
        ) : null}
      </>
    );
  }

  if (enrollPolicy === EnrollPolicy.INVITE_ONLY) {
    return (
      <>
        <Button className="w-full" size="lg" disabled>
          <Lock className="size-4" /> เฉพาะผู้ได้รับเชิญ
        </Button>
        <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
          {ENROLL_POLICY_HINT[EnrollPolicy.INVITE_ONLY]}
        </p>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submitForm((formData) => run(() => enroll(formData)))}>
        <input type="hidden" name="courseId" value={courseId} />
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {enrollPolicy === EnrollPolicy.APPROVAL ? "ขอลงทะเบียนเรียน" : "ลงทะเบียนเรียน"}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
        {state === "expired"
          ? "สิทธิ์เรียนเดิมของคุณหมดอายุแล้ว ลงทะเบียนใหม่เพื่อเรียนต่อจากเดิม"
          : ENROLL_POLICY_HINT[enrollPolicy]}
      </p>
    </>
  );
}
