"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  MonitorPlay,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/shared/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/rich-text-doc";
import { UploadCancelled, UploadError, uploadFile } from "@/features/uploads/lib/upload-client";
import { AssetKind } from "@/generated/prisma/enums";

/**
 * FR-05.4 — ตัวเขียนเนื้อหา Rich text (Tiptap) เก็บผลเป็น JSON
 *
 * ค่าที่ส่งไปกับฟอร์มคือ JSON ผ่าน input ซ่อน แล้ว **ตรวจซ้ำด้วย allowlist ฝั่ง server**
 * ที่ `lib/rich-text-doc.ts` เสมอ — ที่นี่เป็นแค่ความสะดวกของผู้ใช้ ไม่ใช่ด่านความปลอดภัย
 *
 * รูปที่แทรกถูกอัปโหลดเข้า storage เหมือนไฟล์อื่น แล้วอ้างถึงผ่าน `/api/media/<assetId>`
 * จึงไม่มีรูปฝังเป็น data: URL ที่ทำให้เอกสารบวมและเล็ดลอดการตรวจชนิดไฟล์
 */

type DialogState = { kind: "closed" } | { kind: "link" } | { kind: "youtube" };

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn("size-8", active && "bg-accent text-accent-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="bg-line mx-0.5 h-5 w-px" aria-hidden="true" />;
}

export function RichTextEditor({
  name,
  defaultValue,
  placeholder = "เริ่มพิมพ์เนื้อหาที่นี่…",
  minHeight = 220,
  label,
  hint,
  error,
}: {
  /** ชื่อ input ซ่อนที่พา JSON ไปกับฟอร์ม */
  name: string;
  defaultValue?: unknown;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  hint?: string;
  error?: string;
}) {
  const [json, setJson] = React.useState<string>(() =>
    defaultValue ? JSON.stringify(defaultValue) : "",
  );
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "closed" });
  const [uploading, setUploading] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fieldId = React.useId();

  const editor = useEditor({
    // Next render ฝั่ง server ก่อนเสมอ — ถ้าให้ Tiptap render ทันทีจะเกิด hydration mismatch
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          protocols: ["http", "https"],
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
      }),
      Image.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
    ],
    content: (defaultValue as object) ?? "",
    editorProps: {
      attributes: {
        // ผูก id ไว้ที่ตัวพื้นที่พิมพ์เอง ไม่ใช่กรอบข้างนอก
        // เพื่อให้ <label htmlFor> ชี้มาที่ช่องที่โฟกัสได้จริง
        id: fieldId,
        class: "outline-none",
        "aria-label": label ?? "เนื้อหา",
      },
    },
    onUpdate: ({ editor: instance }) => {
      setJson(instance.isEmpty ? "" : JSON.stringify(instance.getJSON()));
    },
  });

  async function insertImage(file: File, instance: Editor) {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, AssetKind.IMAGE);
      instance
        .chain()
        .focus()
        .setImage({ src: mediaSrc(uploaded.assetId), alt: uploaded.originalName })
        .run();
    } catch (err) {
      if (!(err instanceof UploadCancelled)) {
        toast.error(err instanceof UploadError ? err.message : "แทรกรูปไม่สำเร็จ");
      }
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  if (!editor) {
    return (
      <div
        className="bg-card border-border text-muted-foreground flex items-center justify-center rounded-[9px] border text-[13px]"
        style={{ minHeight }}
      >
        <Loader2 className="mr-2 size-4 animate-spin" /> กำลังเตรียมตัวเขียนเนื้อหา…
      </div>
    );
  }

  const linkActive = editor.isActive("link");

  return (
    <div className="space-y-[7px]">
      {label ? (
        <Label htmlFor={fieldId} className="text-[12.5px] font-medium">
          {label}
        </Label>
      ) : null}

      <input type="hidden" name={name} value={json} />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="เลือกรูปที่จะแทรกในเนื้อหา"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void insertImage(file, editor);
        }}
      />

      <div
        className={cn(
          "bg-card border-border overflow-hidden rounded-[9px] border",
          error && "border-danger-fg",
        )}
      >
        <div className="border-line bg-background flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1.5">
          <ToolbarButton
            label="ตัวหนา"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="ตัวเอียง"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="ขีดเส้นใต้"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="ขีดฆ่า"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label="หัวข้อใหญ่"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="หัวข้อย่อย"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="รายการแบบจุด"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="รายการแบบตัวเลข"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="ยกข้อความ"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="size-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label="โค้ดในบรรทัด"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="บล็อกโค้ด"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Code2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="เส้นคั่น"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="size-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label={linkActive ? "แก้ไขลิงก์" : "แทรกลิงก์"}
            active={linkActive}
            onClick={() => setDialog({ kind: "link" })}
          >
            <Link2 className="size-4" />
          </ToolbarButton>
          {linkActive ? (
            <ToolbarButton
              label="เอาลิงก์ออก"
              onClick={() => editor.chain().focus().unsetLink().run()}
            >
              <Link2Off className="size-4" />
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            label="แทรกรูป"
            disabled={uploading}
            onClick={() => imageInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          </ToolbarButton>
          <ToolbarButton label="ฝังวิดีโอ" onClick={() => setDialog({ kind: "youtube" })}>
            <MonitorPlay className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="แทรกตาราง 3×3"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <TableIcon className="size-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label="ย้อนกลับ"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="ทำซ้ำ"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="size-4" />
          </ToolbarButton>
        </div>

        <EditorContent
          editor={editor}
          data-placeholder={placeholder}
          style={{ minHeight }}
          className={cn(
            "px-3.5 py-3 text-[14px] leading-[1.75]",
            "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
            "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[20px] [&_h1]:font-bold",
            "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-semibold",
            "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold",
            "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_blockquote]:border-ring/50 [&_blockquote]:text-muted-foreground [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:pl-4",
            "[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-[13px]",
            "[&_img]:border-line [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border",
            "[&_iframe]:border-line [&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg [&_iframe]:border",
            "[&_table]:border-line [&_table]:my-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:border",
            "[&_td]:border-line [&_td]:border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
            "[&_th]:border-line [&_th]:bg-muted [&_th]:border [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
            "[&_a]:text-ring [&_a]:underline",
            "[&_hr]:border-line [&_hr]:my-5",
          )}
        />
      </div>

      {error ? (
        <p role="alert" className="text-danger-fg text-[12px] font-medium">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-[11.5px]">{hint}</p>
      ) : null}

      {/* ใช้ dialog แทน window.prompt เพราะ prompt บล็อกทั้งหน้าและใช้กับคีย์บอร์ด/สกรีนรีดเดอร์ได้ไม่ดี */}
      <Dialog
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => (open ? null : setDialog({ kind: "closed" }))}
      >
        <DialogContent className="sm:max-w-[420px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const url = String(data.get("url") ?? "").trim();
              if (!url) return;

              if (dialog.kind === "link") {
                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                if (!editor.isActive("link")) {
                  toast.error("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
                  return;
                }
              } else {
                const added = editor.commands.setYoutubeVideo({ src: url });
                if (!added) {
                  toast.error("รองรับเฉพาะลิงก์ YouTube");
                  return;
                }
              }
              setDialog({ kind: "closed" });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {dialog.kind === "youtube" ? "ฝังวิดีโอ YouTube" : "แทรกลิงก์"}
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <Field
                label={dialog.kind === "youtube" ? "ลิงก์วิดีโอ" : "ที่อยู่ลิงก์"}
                name="url"
                type="url"
                placeholder={
                  dialog.kind === "youtube"
                    ? "https://www.youtube.com/watch?v=..."
                    : "https://example.com"
                }
                autoFocus
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                ยกเลิก
              </Button>
              <Button type="submit">ตกลง</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RichTextEditor;
