"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Download, FileUp, Loader2, MessageSquare, Paperclip, Send, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AssetKind, SubmissionStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/decimal";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { UploadCancelled, UploadError, uploadFile } from "@/features/uploads/lib/upload-client";
import { submitAssignment } from "@/features/assignments/actions";
import { SUBMISSION_STATUS_BADGE, submissionFileError, submissionMime } from "@/features/assignments/lib/rules";
import { MAX_SUBMISSION_FILES, SUBMISSION_TEXT_MAX } from "@/features/assignments/schemas";
import type { LessonAssignment } from "@/features/assignments/queries";

type AttachedFile = { assetId: string; originalName: string; sizeLabel: string };
type Uploading = { key: number; name: string; percent: number };

let uploadSeed = 0;

/** M08 · FR-08.2 / FR-08.4 — การ์ดส่งงานในหน้าเรียน: สถานะ ผลตรวจ ฟอร์มส่ง และประวัติการส่ง */
export function AssignmentPanel({ data }: { data: LessonAssignment }) {
  const router = useRouter();
  const { assignment, submissions, blocked } = data;
  const latest = submissions[0] ?? null;
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  // ส่งใหม่: เริ่มจากสิ่งที่ส่งครั้งล่าสุด ผู้เรียนแก้เฉพาะส่วนที่ต้องแก้ได้
  const [files, setFiles] = React.useState<AttachedFile[]>(() => (data.resubmit && latest ? latest.files : []));
  const [uploading, setUploading] = React.useState<Uploading[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const textId = React.useId();
  const accept = assignment.allowedTypes.map((t) => `.${t}`).join(",");

  async function addFiles(list: FileList | null) {
    if (!list) return;
    // นับเองในลูป — state ใน closure นี้ไม่อัปเดตระหว่างที่ยังอัปโหลดอยู่
    let count = files.length + uploading.length;
    for (const file of Array.from(list)) {
      if (count >= MAX_SUBMISSION_FILES) {
        toast.error(`แนบไฟล์ได้ไม่เกิน ${MAX_SUBMISSION_FILES} ไฟล์`);
        break;
      }
      const problem = submissionFileError({ name: file.name, size: file.size }, assignment);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      count += 1;
      const key = (uploadSeed += 1);
      setUploading((u) => [...u, { key, name: file.name, percent: 0 }]);
      try {
        const asset = await uploadFile(file, AssetKind.FILE, {
          assignmentId: assignment.id,
          mime: submissionMime(file.name) ?? undefined,
          onProgress: (percent) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, percent } : x))),
        });
        setFiles((f) => [...f, { assetId: asset.assetId, originalName: asset.originalName, sizeLabel: asset.sizeLabel }]);
      } catch (e) {
        if (!(e instanceof UploadCancelled)) {
          toast.error(`${file.name}: ${e instanceof UploadError ? e.message : "อัปโหลดไม่สำเร็จ"}`);
        }
      } finally {
        setUploading((u) => u.filter((x) => x.key !== key));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit(formData: FormData) {
    for (const f of files) formData.append("assetIds", f.assetId);
    startTransition(async () => {
      const result = await submitAssignment(formData);
      if (result.ok) {
        toast.success(result.message);
        setError(null);
        router.refresh();
      } else {
        setError(result.fieldErrors?.text ?? result.fieldErrors?.files ?? null);
        toast.error(result.message);
      }
    });
  }

  return (
    <section aria-labelledby="assignment-title" className="bg-card border-border rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="assignment-title" className="text-[16px] font-semibold">
          {assignment.title}
        </h2>
        {latest ? (
          <Badge className={cn("border-0", SUBMISSION_STATUS_BADGE[latest.status].tone)}>
            {SUBMISSION_STATUS_BADGE[latest.status].label}
          </Badge>
        ) : (
          <Badge variant="secondary">ยังไม่ส่ง</Badge>
        )}
      </div>

      <ul className="text-fg-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <li className="flex items-center gap-1.5">
          <CalendarClock className="size-4" aria-hidden />
          {assignment.dueAt ? `กำหนดส่ง ${formatDateTime(assignment.dueAt)}` : "ไม่มีกำหนดส่ง"}
          {assignment.dueAt && !assignment.allowLate ? " (ไม่รับงานส่งช้า)" : ""}
        </li>
        <li className="flex items-center gap-1.5">
          <Target className="size-4" aria-hidden /> คะแนนเต็ม {formatScore(assignment.maxScore)}
        </li>
        <li className="flex items-center gap-1.5">
          <Paperclip className="size-4" aria-hidden /> {assignment.allowedTypes.map((t) => `.${t}`).join(" ")} · ไม่เกิน{" "}
          {assignment.maxFileMb} MB ต่อไฟล์
        </li>
      </ul>

      {latest && latest.status !== SubmissionStatus.SUBMITTED ? (
        <div
          data-assignment-result
          className={cn(
            "mt-4 rounded-lg px-4 py-3",
            latest.status === SubmissionStatus.GRADED ? "bg-success-bg" : "bg-info-bg",
          )}
        >
          {latest.status === SubmissionStatus.GRADED ? (
            <p className="text-success-fg text-[14px] font-semibold">
              ได้ <span data-assignment-score>{formatScore(latest.score)}/{formatScore(assignment.maxScore)}</span> คะแนน
            </p>
          ) : (
            <p className="text-info-fg text-[14px] font-semibold">ผู้สอนส่งงานกลับให้แก้ — แก้แล้วส่งใหม่ได้แม้เลยกำหนด</p>
          )}
          {latest.feedback ? (
            <p className="text-fg-2 mt-1 flex gap-2 text-[13px] whitespace-pre-wrap">
              <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden /> {latest.feedback}
            </p>
          ) : null}
        </div>
      ) : null}

      {blocked ? (
        <p className="bg-muted text-fg-2 mt-4 rounded-lg px-4 py-3 text-[13px]">{blocked}</p>
      ) : (
        <form onSubmit={submitForm(submit)} aria-label="ส่งงาน" className="border-line mt-4 space-y-3 border-t pt-4">
          <input type="hidden" name="assignmentId" value={assignment.id} />
          {data.willBeLate ? (
            <p className="bg-warning-bg text-warning-fg rounded-lg px-3 py-2 text-[12.5px]">
              เลยกำหนดส่งแล้ว — ยังส่งได้แต่จะถูกบันทึกว่า “ส่งช้า”
            </p>
          ) : null}
          {data.resubmit && latest?.status === SubmissionStatus.SUBMITTED ? (
            <p className="text-muted-foreground text-[12.5px]">
              ส่งใหม่ได้จนถึงกำหนดส่ง — ครั้งใหม่จะเก็บแยก ครั้งเดิมไม่ถูกลบ ผู้สอนตรวจครั้งล่าสุด
            </p>
          ) : null}

          <div className="space-y-[7px]">
            <Label htmlFor={textId} className="text-[12.5px] font-medium">
              คำตอบ / ข้อความถึงผู้สอน
            </Label>
            <textarea
              id={textId}
              name="text"
              rows={5}
              maxLength={SUBMISSION_TEXT_MAX}
              defaultValue={data.resubmit ? (latest?.text ?? "") : ""}
              aria-invalid={Boolean(error) || undefined}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[12.5px] font-medium">ไฟล์แนบ</p>
            {files.length > 0 || uploading.length > 0 ? (
              <ul aria-label="ไฟล์ที่แนบ" className="border-border divide-line divide-y rounded-lg border">
                {files.map((f) => (
                  <li key={f.assetId} data-attached-file className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                    <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.originalName}</span>
                    <span className="text-muted-foreground shrink-0 text-[11.5px]">{f.sizeLabel}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`นำ ${f.originalName} ออก`}
                      onClick={() => setFiles((list) => list.filter((x) => x.assetId !== f.assetId))}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
                {uploading.map((u) => (
                  <li key={u.key} className="space-y-1 px-3 py-2.5 text-[13px]">
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className="tabular-nums">{u.percent}%</span>
                    </span>
                    <Progress value={u.percent} aria-label={`กำลังอัปโหลด ${u.name} ${u.percent}%`} />
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              aria-label="เลือกไฟล์ที่จะส่ง"
              onChange={(e) => void addFiles(e.currentTarget.files)}
            />
            <Button type="button" variant="outline" className="min-h-11" onClick={() => inputRef.current?.click()}>
              <FileUp className="size-4" /> แนบไฟล์
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-danger-fg text-[12px] font-medium">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending || uploading.length > 0} className="min-h-11">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {data.resubmit ? "ส่งงานอีกครั้ง" : "ส่งงาน"}
          </Button>
        </form>
      )}

      {submissions.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold">ประวัติการส่ง</h3>
          <ol className="border-border divide-line divide-y rounded-lg border">
            {submissions.map((s) => (
              <li key={s.id} data-submission className="space-y-1 px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">ครั้งที่ {s.attemptNo}</span>
                  <span className="text-muted-foreground">{formatDateTime(s.submittedAt)}</span>
                  {s.isLate ? <Badge className="bg-danger-bg text-danger-fg border-0">ส่งช้า</Badge> : null}
                  <Badge className={cn("ml-auto border-0", SUBMISSION_STATUS_BADGE[s.status].tone)}>
                    {SUBMISSION_STATUS_BADGE[s.status].label}
                  </Badge>
                </div>
                {s.files.length ? (
                  <ul className="flex flex-wrap gap-x-3">
                    {s.files.map((f) => (
                      <li key={f.assetId}>
                        <a
                          href={`/api/submission-file/${f.assetId}`}
                          className="text-primary inline-flex min-h-11 items-center gap-1 hover:underline"
                        >
                          <Download className="size-3.5" aria-hidden /> {f.originalName}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
