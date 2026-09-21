"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * โหลด Tiptap เฉพาะตอนที่ต้องใช้จริง
 *
 * ตัว editor พร้อม ProseMirror เป็นก้อน JavaScript ที่ใหญ่ที่สุดในฝั่งผู้สอน
 * และหน้าอื่น ๆ ไม่ได้ใช้เลย · `ssr: false` เพราะ ProseMirror ต้องมี DOM จริง
 * (ตัวเลือกนี้ใช้ได้เฉพาะใน Client Component — ดู docs/01-app/02-guides/lazy-loading.md)
 */
export const RichTextField = dynamic(
  () => import("@/components/editor/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="bg-card border-border text-muted-foreground flex min-h-[220px] items-center justify-center rounded-[9px] border text-[13px]">
        <Loader2 className="mr-2 size-4 animate-spin" /> กำลังเตรียมตัวเขียนเนื้อหา…
      </div>
    ),
  },
);
