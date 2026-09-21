"use client";

import * as React from "react";
import { FileText, ImageIcon, Loader2, Paperclip, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { UPLOAD_RULES, formatBytes } from "@/lib/upload-limits";
import { mediaSrc } from "@/lib/rich-text-doc";
import {
  UploadCancelled,
  UploadError,
  uploadFile,
  type UploadedAsset,
} from "@/features/uploads/lib/upload-client";
import { AssetKind } from "@/generated/prisma/enums";

/**
 * FR-05.1 — ช่องแนบไฟล์ที่ใช้ร่วมกันทั้งภาพปก วิดีโอ เอกสาร และไฟล์ประกอบ
 *
 * ค่าที่ได้ออกไปกับฟอร์มคือ **รหัส Asset** ผ่าน input ซ่อน (ไม่ใช่ตัวไฟล์)
 * เพราะไฟล์ถูกส่งตรงไปยัง storage ไปแล้วตั้งแต่ตอนเลือก
 */

export type AssetValue = {
  assetId: string;
  originalName: string;
  sizeLabel: string;
};

const KIND_ICON: Record<AssetKind, React.ReactNode> = {
  VIDEO: <Video className="size-4" />,
  PDF: <FileText className="size-4" />,
  IMAGE: <ImageIcon className="size-4" />,
  FILE: <Paperclip className="size-4" />,
};

export function AssetField({
  label,
  name,
  kind,
  hint,
  error,
  defaultValue = null,
  onUploaded,
  className,
}: {
  label: string;
  /** ชื่อของ input ซ่อนที่พารหัส Asset ไปกับฟอร์ม — ไม่ใส่ก็ได้ถ้าใช้ผ่าน onUploaded อย่างเดียว */
  name?: string;
  kind: AssetKind;
  hint?: string;
  error?: string;
  defaultValue?: AssetValue | null;
  /** แจ้งผู้เรียกเมื่ออัปโหลดเสร็จหรือถูกลบออก (null = ไม่มีไฟล์แล้ว) */
  onUploaded?: (asset: AssetValue | null) => void;
  className?: string;
}) {
  const rule = UPLOAD_RULES[kind];
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [asset, setAsset] = React.useState<AssetValue | null>(defaultValue);
  const [percent, setPercent] = React.useState<number | null>(null);
  const fieldId = React.useId();

  const uploading = percent !== null;

  async function start(file: File) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPercent(0);

    try {
      const uploaded: UploadedAsset = await uploadFile(file, kind, {
        signal: controller.signal,
        onProgress: setPercent,
      });
      const value: AssetValue = {
        assetId: uploaded.assetId,
        originalName: uploaded.originalName,
        sizeLabel: uploaded.sizeLabel,
      };
      setAsset(value);
      onUploaded?.(value);
      toast.success(`อัปโหลด ${uploaded.originalName} แล้ว`);
    } catch (err) {
      if (err instanceof UploadCancelled) {
        toast.info(err.message);
      } else {
        toast.error(err instanceof UploadError ? err.message : "อัปโหลดไม่สำเร็จ");
      }
    } finally {
      abortRef.current = null;
      setPercent(null);
      // ล้างค่า input เพื่อให้เลือกไฟล์เดิมซ้ำแล้วยังเกิด change event
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    setAsset(null);
    onUploaded?.(null);
  }

  return (
    <div className={cn("space-y-[7px]", className)}>
      <Label htmlFor={fieldId} className="text-[12.5px] font-medium">
        {label}
      </Label>

      {name ? <input type="hidden" name={name} value={asset?.assetId ?? ""} /> : null}

      <input
        ref={inputRef}
        id={fieldId}
        type="file"
        accept={rule.mimes.join(",")}
        className="sr-only"
        disabled={uploading}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void start(file);
        }}
      />

      {uploading ? (
        <div className="bg-card border-border space-y-2 rounded-[9px] border p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate text-[13px]">กำลังอัปโหลด…</span>
            <span className="num text-muted-foreground text-[12px]">{percent}%</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="ยกเลิกการอัปโหลด"
              onClick={() => abortRef.current?.abort()}
            >
              <X className="size-4" />
            </Button>
          </div>
          <Progress
            value={percent ?? 0}
            aria-label="ความคืบหน้าการอัปโหลด"
            className="h-1.5"
          />
        </div>
      ) : asset ? (
        <div className="bg-card border-border flex items-center gap-2.5 rounded-[9px] border p-3">
          {kind === AssetKind.IMAGE ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(asset.assetId)}
              alt=""
              className="border-line size-12 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              {KIND_ICON[kind]}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{asset.originalName}</span>
            <span className="text-muted-foreground num block text-[11.5px]">{asset.sizeLabel}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            เปลี่ยน
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`เอา ${asset.originalName} ออก`}
            className="text-destructive"
            onClick={clear}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-start rounded-[9px] font-normal"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" /> เลือก{rule.label}
        </Button>
      )}

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-danger-fg text-[12px] font-medium">
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground text-[11.5px]">
          {hint ? `${hint} · ` : ""}ไม่เกิน {formatBytes(rule.maxSize)}
        </p>
      )}
    </div>
  );
}
