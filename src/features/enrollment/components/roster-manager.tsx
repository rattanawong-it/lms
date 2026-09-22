"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2, UserMinus, UserPlus, Users, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import {
  bulkEnroll,
  decideEnrollment,
  removeEnrollment,
  setEnrollmentExpiry,
} from "@/features/enrollment/actions";
import {
  ENROLLMENT_SOURCE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_TONE,
} from "@/features/enrollment/lib/labels";
import type { CourseRoster, RosterRow } from "@/features/enrollment/queries";
import { MAX_BULK_ENROLL } from "@/features/enrollment/schemas";
import { EnrollmentSource, EnrollmentStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";

type ActionResultLike = { ok: boolean; message: string; fieldErrors?: Record<string, string> };

type DialogState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "expiry"; row: RosterRow }
  | { mode: "remove"; row: RosterRow };

/** ค่าเริ่มต้นของ `<input type="date">` — ต้องเป็น YYYY-MM-DD ตามเวลาไทย */
function dateInputValue(value: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(value);
}

/** M06 · FR-06.1 / FR-06.2 — คิวอนุมัติ รายชื่อผู้เรียน และการเพิ่มผู้เรียนเป็นกลุ่ม */
export function RosterManager({ roster }: { roster: CourseRoster }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" });
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

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

  function close() {
    setDialog({ mode: "closed" });
    setFieldErrors({});
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["กำลังเรียน", roster.counts.active],
            ["เรียนจบ", roster.counts.completed],
            ["หมดอายุ", roster.counts.expired],
            ["รออนุมัติ", roster.counts.pending],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-card border-border rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-[12px]">{label}</p>
            <p className="num mt-0.5 text-[20px] font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* FR-06.1 — คิวคำขอที่รออนุมัติ */}
      {roster.pending.length > 0 ? (
        <section aria-labelledby="pending-queue" className="mb-5">
          <h2 id="pending-queue" className="mb-2 text-[15px] font-semibold">
            คำขอที่รออนุมัติ
          </h2>
          <ul className="bg-card border-border divide-line divide-y rounded-xl border">
            {roster.pending.map((row) => (
              <li
                key={row.enrollmentId}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-muted-foreground num truncate text-[11.5px]">{row.email}</p>
                </div>
                <span className="text-muted-foreground num shrink-0 text-[11.5px]">
                  ส่งคำขอ {formatDate(row.enrolledAt)}
                </span>
                <div className="flex shrink-0 gap-2">
                  <form
                    onSubmit={submitForm((fd) => run(() => decideEnrollment(fd)))}
                    className="contents"
                  >
                    <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                    <input type="hidden" name="decision" value="approve" />
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      อนุมัติ
                    </Button>
                  </form>
                  <form
                    onSubmit={submitForm((fd) => run(() => decideEnrollment(fd)))}
                    className="contents"
                  >
                    <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" size="sm" variant="outline" disabled={pending}>
                      <X className="size-4" /> ปฏิเสธ
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* FR-06.2 — รายชื่อผู้เรียน */}
      <section aria-labelledby="roster">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="roster" className="text-[15px] font-semibold">
            ผู้เรียนในคอร์ส
          </h2>
          <Button size="sm" onClick={() => setDialog({ mode: "add" })}>
            <UserPlus className="size-4" /> เพิ่มผู้เรียน
          </Button>
        </div>

        {roster.enrolled.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="ยังไม่มีผู้เรียนในคอร์สนี้"
            description="เพิ่มผู้เรียนเป็นกลุ่มด้วยรายการอีเมล หรือรอให้ผู้เรียนสมัครเข้ามาเอง"
            action={
              <Button onClick={() => setDialog({ mode: "add" })}>
                <UserPlus className="size-4" /> เพิ่มผู้เรียน
              </Button>
            }
          />
        ) : (
          <div className="bg-card border-border overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <caption className="sr-only">
                  รายชื่อผู้เรียนของคอร์ส {roster.title}
                </caption>
                <thead className="bg-background border-line text-muted-foreground border-b">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      ผู้เรียน
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      สถานะ
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      ความคืบหน้า
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      วันหมดสิทธิ์
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {roster.enrolled.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-muted-foreground num text-[11.5px]">
                          {row.email} ·{" "}
                          {ENROLLMENT_SOURCE_LABEL[row.source as EnrollmentSource] ?? row.source}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={cn(
                            row.expired && row.status === EnrollmentStatus.ACTIVE
                              ? ENROLLMENT_STATUS_TONE[EnrollmentStatus.EXPIRED]
                              : ENROLLMENT_STATUS_TONE[row.status],
                          )}
                        >
                          {row.expired && row.status === EnrollmentStatus.ACTIVE
                            ? ENROLLMENT_STATUS_LABEL[EnrollmentStatus.EXPIRED]
                            : ENROLLMENT_STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={row.progressPct}
                            className="w-[90px]"
                            aria-label={`${row.name} เรียนไปแล้ว ${row.progressPct} เปอร์เซ็นต์`}
                          />
                          <span className="num text-[12px]">{row.progressPct}%</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground num px-4 py-3 text-[12px]">
                        {row.expiresAt ? formatDate(row.expiresAt) : "ไม่กำหนด"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`กำหนดวันหมดสิทธิ์ของ ${row.name}`}
                            onClick={() => setDialog({ mode: "expiry", row })}
                          >
                            <CalendarClock className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            aria-label={`ถอน ${row.name} ออกจากคอร์ส`}
                            onClick={() => setDialog({ mode: "remove", row })}
                          >
                            <UserMinus className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* FR-06.2 — เพิ่มผู้เรียนเป็นกลุ่ม */}
      <Dialog open={dialog.mode === "add"} onOpenChange={(open) => (open ? null : close())}>
        {/* จอ 375px: เนื้อหาสูงกว่าจอได้ จึงจำกัดความสูงแล้วให้เลื่อนในกล่องแทนที่จะล้นออกนอกจอ */}
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[520px]">
          <form onSubmit={submitForm((fd) => run(() => bulkEnroll(fd), close))}>
            <DialogHeader>
              <DialogTitle>เพิ่มผู้เรียนเป็นกลุ่ม</DialogTitle>
              <DialogDescription>
                วางรายการอีเมลทีละบรรทัด หรือวางเนื้อหาไฟล์ CSV ลงไปทั้งก้อนก็ได้ —
                ระบบจะดึงเฉพาะอีเมลออกมา ผู้เรียนต้องมีบัญชีในระบบอยู่แล้ว
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <input type="hidden" name="courseId" value={roster.courseId} />

              <div className="space-y-[7px]">
                <Label htmlFor="emails" className="text-[12.5px] font-medium">
                  อีเมลผู้เรียน (ไม่เกิน {MAX_BULK_ENROLL} คน)
                </Label>
                <textarea
                  id="emails"
                  name="emails"
                  rows={5}
                  required
                  aria-invalid={Boolean(fieldErrors.emails) || undefined}
                  aria-describedby={fieldErrors.emails ? "emails-error" : undefined}
                  placeholder={"student1@krirk.ac.th\nstudent2@krirk.ac.th"}
                  className="bg-card border-input focus-visible:ring-ring aria-invalid:border-danger-fg w-full rounded-[9px] border px-3 py-2 font-mono text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
                />
                {fieldErrors.emails ? (
                  <p id="emails-error" role="alert" className="text-danger-fg text-[12px] font-medium">
                    {fieldErrors.emails}
                  </p>
                ) : null}
              </div>

              <Field
                label="วันหมดสิทธิ์เรียน (ไม่บังคับ)"
                name="expiresAt"
                type="date"
                hint="เว้นว่างไว้ถ้าให้เรียนได้ไม่จำกัดเวลา"
                error={fieldErrors.expiresAt}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                เพิ่มผู้เรียน
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FR-06.2 — วันหมดสิทธิ์รายคน */}
      <Dialog open={dialog.mode === "expiry"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={submitForm((fd) => run(() => setEnrollmentExpiry(fd), close))}>
            <DialogHeader>
              <DialogTitle>วันหมดสิทธิ์เรียน</DialogTitle>
              <DialogDescription>
                {dialog.mode === "expiry" ? dialog.row.name : ""} จะเรียนได้ถึงสิ้นวันที่ระบุ
                เว้นว่างเพื่อยกเลิกการจำกัดเวลา
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <input
                type="hidden"
                name="enrollmentId"
                value={dialog.mode === "expiry" ? dialog.row.enrollmentId : ""}
              />
              <Field
                label="เรียนได้ถึงวันที่"
                name="expiresAt"
                type="date"
                defaultValue={dialog.mode === "expiry" ? dateInputValue(dialog.row.expiresAt) : ""}
                error={fieldErrors.expiresAt}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ถอนผู้เรียน */}
      <Dialog open={dialog.mode === "remove"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={submitForm((fd) => run(() => removeEnrollment(fd), close))}>
            <DialogHeader>
              <DialogTitle>ถอนผู้เรียนออกจากคอร์ส</DialogTitle>
              <DialogDescription>
                {dialog.mode === "remove" ? dialog.row.name : ""} จะเข้าเรียนคอร์สนี้ไม่ได้อีก
                ความคืบหน้าเดิมยังถูกเก็บไว้ และลงทะเบียนใหม่ได้ภายหลัง
              </DialogDescription>
            </DialogHeader>

            <input
              type="hidden"
              name="enrollmentId"
              value={dialog.mode === "remove" ? dialog.row.enrollmentId : ""}
            />

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ถอนผู้เรียน
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
