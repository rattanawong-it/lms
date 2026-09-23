"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

type EditorProps = React.ComponentProps<
  typeof import("@/components/editor/rich-text-editor").RichTextEditor
>;

/**
 * ค่าของฟิลด์ระหว่างที่ editor ยังโหลดไม่เสร็จ — `loading` ของ `next/dynamic` ไม่ได้รับ props
 * จึงส่งผ่าน context แทน
 */
const PendingField = React.createContext<Pick<EditorProps, "name" | "defaultValue"> | null>(null);

function EditorLoading() {
  const field = React.useContext(PendingField);
  return (
    <div className="bg-card border-border text-muted-foreground flex min-h-[220px] items-center justify-center rounded-[9px] border text-[13px]">
      {/*
        ส่งค่าเดิมไปกับฟอร์มระหว่างรอ editor — ไม่งั้นกดบันทึกเร็วกว่าที่ Tiptap โหลดเสร็จ
        ฟอร์มจะส่งเนื้อหาว่าง และ server ตีความว่าผู้ใช้ลบเนื้อหาทิ้ง (คำอธิบายคอร์ส/บทความหายได้)
      */}
      {field ? (
        <input
          type="hidden"
          name={field.name}
          value={field.defaultValue ? JSON.stringify(field.defaultValue) : ""}
        />
      ) : null}
      <Loader2 className="mr-2 size-4 animate-spin" /> กำลังเตรียมตัวเขียนเนื้อหา…
    </div>
  );
}

/**
 * โหลด Tiptap เฉพาะตอนที่ต้องใช้จริง
 *
 * ตัว editor พร้อม ProseMirror เป็นก้อน JavaScript ที่ใหญ่ที่สุดในฝั่งผู้สอน
 * และหน้าอื่น ๆ ไม่ได้ใช้เลย · `ssr: false` เพราะ ProseMirror ต้องมี DOM จริง
 * (ตัวเลือกนี้ใช้ได้เฉพาะใน Client Component — ดู docs/01-app/02-guides/lazy-loading.md)
 */
const LazyEditor = dynamic(
  () => import("@/components/editor/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: EditorLoading },
);

export function RichTextField(props: EditorProps) {
  return (
    <PendingField.Provider value={{ name: props.name, defaultValue: props.defaultValue }}>
      <LazyEditor {...props} />
    </PendingField.Provider>
  );
}
