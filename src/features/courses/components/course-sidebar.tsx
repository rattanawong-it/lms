"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import {
  addInstructor,
  removeInstructor,
  transitionCourse,
  updateCompletionRule,
} from "@/features/courses/actions";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE } from "@/features/courses/lib/labels";
import type { CourseEditor } from "@/features/courses/queries";
import type { CourseTransition } from "@/features/courses/schemas";
import { CourseStatus } from "@/generated/prisma/enums";

type ActionResultLike = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/** ปุ่มเปลี่ยนสถานะที่แสดงได้ในแต่ละสถานะ (FR-04.6) */
function availableTransitions(
  status: CourseStatus,
  canManage: boolean,
): { key: CourseTransition; label: string; variant?: "default" | "outline" | "destructive" }[] {
  switch (status) {
    case CourseStatus.DRAFT:
      return [
        { key: "submit", label: "ส่งให้คณะอนุมัติ" },
        ...(canManage
          ? ([{ key: "archive", label: "เก็บเข้าคลัง", variant: "outline" }] as const)
          : []),
      ];
    case CourseStatus.PENDING_REVIEW:
      return canManage
        ? [
            { key: "approve", label: "อนุมัติและเผยแพร่" },
            { key: "reject", label: "ส่งกลับให้แก้ไข", variant: "outline" },
          ]
        : [];
    case CourseStatus.PUBLISHED:
      return canManage
        ? [
            { key: "unpublish", label: "นำออกจากการเผยแพร่", variant: "outline" },
            { key: "archive", label: "เก็บเข้าคลัง", variant: "outline" },
          ]
        : [];
    case CourseStatus.ARCHIVED:
      return canManage ? [{ key: "restore", label: "นำกลับมาเป็นฉบับร่าง" }] : [];
  }
}

/** M04 — แผงข้างของหน้าตั้งค่าคอร์ส: สถานะ ผู้สอนร่วม และเงื่อนไขการจบ */
export function CourseSidebar({ course }: { course: CourseEditor }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = React.useState(false);

  function run(action: () => Promise<ActionResultLike>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setFieldErrors({});
        onSuccess?.();
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  const transitions = availableTransitions(course.status, course.canManage);

  return (
    <div className="space-y-4">
      {/* สถานะและ workflow */}
      <section className="bg-card border-border rounded-xl border p-4">
        <h2 className="mb-3 text-[14px] font-semibold">สถานะคอร์ส</h2>

        <Badge variant="secondary" className={COURSE_STATUS_TONE[course.status]}>
          {COURSE_STATUS_LABEL[course.status]}
        </Badge>

        <p className="text-muted-foreground mt-3 text-[12px] leading-relaxed">
          {course.status === CourseStatus.DRAFT
            ? "คอร์สยังไม่ปรากฏในคลังคอร์ส ส่งให้คณะตรวจเมื่อเพิ่มบทเรียนเรียบร้อยแล้ว"
            : course.status === CourseStatus.PENDING_REVIEW
              ? "รอผู้ดูแลคณะตรวจและอนุมัติ ระหว่างนี้ยังแก้ไขเนื้อหาได้"
              : course.status === CourseStatus.PUBLISHED
                ? "เผยแพร่แล้ว ผู้เรียนเห็นคอร์สนี้ในคลังคอร์สตามการมองเห็นที่ตั้งไว้"
                : "เก็บเข้าคลังแล้ว ไม่ปรากฏในคลังคอร์ส"}
        </p>

        {transitions.length > 0 ? (
          <div className="mt-4 space-y-2">
            {transitions.map((t) => (
              <form
                key={t.key}
                action={(fd) => run(() => transitionCourse(fd))}
                className="contents"
              >
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="transition" value={t.key} />
                <Button
                  type="submit"
                  variant={t.variant ?? "default"}
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t.label}
                </Button>
              </form>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-[12px]">
            การเปลี่ยนสถานะขั้นถัดไปต้องให้ผู้ดูแลคณะเป็นผู้ทำ
          </p>
        )}
      </section>

      {/* FR-04.5 ผู้สอนร่วม */}
      <section className="bg-card border-border rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold">ผู้สอน</h2>
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" /> เพิ่ม
          </Button>
        </div>

        <ul className="space-y-2">
          {course.instructors.map((i) => (
            <li key={i.userId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{i.name}</p>
                <p className="text-muted-foreground num truncate text-[11.5px]">{i.email}</p>
              </div>
              <Badge variant="secondary" className="bg-muted text-fg-3 shrink-0">
                {i.role === "OWNER" ? "เจ้าของ" : "ผู้สอนร่วม"}
              </Badge>
              {course.instructors.length > 1 ? (
                <form action={(fd) => run(() => removeInstructor(fd))} className="contents">
                  <input type="hidden" name="courseId" value={course.id} />
                  <input type="hidden" name="userId" value={i.userId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive shrink-0"
                    aria-label={`ถอด ${i.name} ออกจากผู้สอน`}
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* FR-04.7 เงื่อนไขการจบคอร์ส */}
      <section className="bg-card border-border rounded-xl border p-4">
        <h2 className="mb-3 text-[14px] font-semibold">เงื่อนไขการจบคอร์ส</h2>

        <form action={(fd) => run(() => updateCompletionRule(fd))} className="space-y-4">
          <input type="hidden" name="courseId" value={course.id} />

          <Field
            label="เรียนครบอย่างน้อย (%)"
            name="minProgress"
            type="number"
            min={1}
            max={100}
            defaultValue={course.completionRule.minProgress}
            error={fieldErrors.minProgress}
          />

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="requireQuizPass"
              name="requireQuizPass"
              defaultChecked={course.completionRule.requireQuizPass}
              className="mt-0.5"
            />
            <Label
              htmlFor="requireQuizPass"
              className="text-[12.5px] leading-relaxed font-normal"
            >
              ต้องผ่านแบบทดสอบทุกชุดในคอร์ส
            </Label>
          </div>

          <Field
            label="คะแนนรวมขั้นต่ำ (ไม่บังคับ)"
            name="minScore"
            type="number"
            min={0}
            max={100}
            defaultValue={course.completionRule.minScore ?? ""}
            placeholder="เว้นว่างถ้าไม่กำหนด"
            error={fieldErrors.minScore}
          />

          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            เงื่อนไขนี้ใช้ตัดสินว่าผู้เรียนจบคอร์สแล้วหรือยัง
            และเป็นตัวกำหนดการออกใบประกาศใน M10
          </p>

          <Button type="submit" variant="outline" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            บันทึกเงื่อนไข
          </Button>
        </form>
      </section>

      {/* เพิ่มผู้สอนร่วม */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form action={(fd) => run(() => addInstructor(fd), () => setAddOpen(false))}>
            <DialogHeader>
              <DialogTitle>เพิ่มผู้สอนร่วม</DialogTitle>
              <DialogDescription>
                ผู้ที่ถูกเพิ่มต้องมีบัญชีในระบบและมีบทบาทผู้สอนขึ้นไปอยู่แล้ว
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <input type="hidden" name="courseId" value={course.id} />
              <Field
                label="อีเมลของผู้สอน"
                name="email"
                type="email"
                placeholder="instructor@krirk.ac.th"
                required
                error={fieldErrors.email}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                เพิ่มผู้สอนร่วม
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
