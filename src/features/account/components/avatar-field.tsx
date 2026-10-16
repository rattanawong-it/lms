"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { removeAvatar, setAvatar } from "@/features/account/actions";
import { AVATAR_SOURCE_MIMES } from "@/features/account/lib/avatar";
import { resizeAvatar } from "@/features/account/lib/resize-avatar";
import { UploadError, uploadFile } from "@/features/uploads/lib/upload-client";
import { AssetKind } from "@/generated/prisma/enums";

/** M01 · FR-01.5 — เปลี่ยน/ลบรูปโปรไฟล์ (system-design §5.9) */
export function AvatarField({ name, image }: { name: string; image: string | null }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<"upload" | "remove" | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ""; // เลือกไฟล์เดิมซ้ำได้หลังล้ม
    if (!file) return;

    setBusy("upload");
    try {
      const resized = await resizeAvatar(file);
      const asset = await uploadFile(resized, AssetKind.IMAGE, { purpose: "avatar" });
      const result = await setAvatar({ assetId: asset.assetId });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof UploadError ? error.message : "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy("remove");
    try {
      const result = await removeAvatar();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-20">
        {image ? <AvatarImage src={image} alt={`รูปโปรไฟล์ของ ${name}`} /> : null}
        <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-semibold">
          {name.slice(0, 1)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_SOURCE_MIMES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-[9px]"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {image ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          </Button>
          {image ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive h-11 rounded-[9px]"
              disabled={busy !== null}
              onClick={handleRemove}
            >
              {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              ลบรูป
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-[11.5px]">
          PNG, JPEG หรือ WebP · ระบบครอปเป็นสี่เหลี่ยมจัตุรัสจากกึ่งกลางให้อัตโนมัติ
        </p>
      </div>
    </div>
  );
}
