"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AssetField } from "@/features/uploads/components/asset-field";
import {
  addAttachment,
  removeAttachment,
  setAttachmentDownloadable,
} from "@/features/courses/actions";
import type { CurriculumSection } from "@/features/courses/queries";
import { AssetKind } from "@/generated/prisma/enums";

type Attachment = CurriculumSection["lessons"][number]["attachments"][number];

/**
 * FR-05.7 — ไฟล์ประกอบของบทเรียน
 *
 * ค่าตั้งต้นของไฟล์ใหม่คือ "ดูได้แต่ดาวน์โหลดไม่ได้" ตามแนวทางป้องกันเนื้อหาของ M15
 * ผู้สอนต้องติ๊กเปิดเองเป็นราย ๆ ไป
 */
export function AttachmentManager({
  lessonId,
  attachments,
}: {
  lessonId: string;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [uploadKey, setUploadKey] = React.useState(0);

  /**
   * ติ๊กแล้วให้ช่องขยับทันที ไม่ต้องรอ server ตอบ
   * ถ้าบันทึกไม่สำเร็จ React จะคืนค่ากลับเป็นของจริงให้เองตอนจบ transition
   */
  const [shown, markDownloadable] = React.useOptimistic(
    attachments,
    (state, next: { id: string; downloadable: boolean }) =>
      state.map((file) => (file.id === next.id ? { ...file, downloadable: next.downloadable } : file)),
  );

  /**
   * สลับสิทธิ์ดาวน์โหลด — ทำ optimistic update กับการเรียก action ใน transition เดียวกัน
   * ถ้าแยกคนละ transition ค่า optimistic จะถูกคืนกลับทันทีก่อน server ตอบ
   */
  function toggleDownloadable(id: string, downloadable: boolean) {
    const form = new FormData();
    form.set("id", id);
    form.set("downloadable", downloadable ? "true" : "false");

    startTransition(async () => {
      markDownloadable({ id, downloadable });
      const result = await setAttachmentDownloadable(form);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

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

  return (
    <div className="space-y-4">
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px]">
          ยังไม่มีไฟล์ประกอบในบทเรียนนี้
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((file) => (
            <li
              key={file.id}
              className="bg-card border-border flex flex-wrap items-center gap-2.5 rounded-[9px] border p-3"
            >
              <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                <Paperclip className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{file.originalName}</span>
                <span className="text-muted-foreground num block text-[11.5px]">
                  {file.sizeLabel}
                </span>
              </span>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`dl-${file.id}`}
                  checked={file.downloadable}
                  onCheckedChange={(checked) => toggleDownloadable(file.id, checked === true)}
                />
                <Label
                  htmlFor={`dl-${file.id}`}
                  className="text-muted-foreground flex items-center gap-1 text-[12px] font-normal"
                >
                  <Download className="size-3.5" /> ให้ดาวน์โหลดได้
                </Label>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`เอาไฟล์ ${file.originalName} ออก`}
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set("id", file.id);
                  run(() => removeAttachment(form));
                }}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* อัปโหลดเสร็จแล้วผูกเข้ากับบทเรียนทันที ไม่ต้องกดบันทึกซ้ำ */}
      <AssetField
        key={uploadKey}
        label="เพิ่มไฟล์ประกอบ"
        kind={AssetKind.FILE}
        hint="เอกสาร Office, PDF, รูป, ไฟล์ข้อความ หรือ ZIP"
        onUploaded={(asset) => {
          if (!asset) return;
          const form = new FormData();
          form.set("lessonId", lessonId);
          form.set("assetId", asset.assetId);
          form.set("downloadable", "false");
          run(() => addAttachment(form));
          setUploadKey((k) => k + 1);
        }}
      />

      {pending ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
          <Loader2 className="size-3.5 animate-spin" /> กำลังบันทึก…
        </p>
      ) : null}
    </div>
  );
}
