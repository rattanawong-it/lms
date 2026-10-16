"use client";

import * as React from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/shared/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/rich-text-doc";
import { TEXT_ALIGNS } from "@/lib/rich-text-styles";
import { UploadCancelled, UploadError, uploadFile } from "@/features/uploads/lib/upload-client";
import { AssetKind } from "@/generated/prisma/enums";
import { Callout, NamedHighlight, SizedImage, TextColorMark } from "@/components/editor/extensions";
import { RichTextToolbar, type ToolbarDialog } from "@/components/editor/rich-text-toolbar";
import { countWords, prettyHtml } from "@/components/editor/lib";

/**
 * FR-05.4 · FR-05.10 — ตัวเขียนเนื้อหา Rich text (Tiptap) เก็บผลเป็น JSON (system-design §8.4)
 *
 * ค่าที่ส่งไปกับฟอร์มคือ JSON ผ่าน input ซ่อน แล้ว **ตรวจซ้ำด้วย allowlist ฝั่ง server**
 * ที่ `lib/rich-text-doc.ts` เสมอ — ที่นี่เป็นแค่ความสะดวกของผู้ใช้ ไม่ใช่ด่านความปลอดภัย
 *
 * รูปที่แทรกถูกอัปโหลดเข้า storage เหมือนไฟล์อื่น แล้วอ้างถึงผ่าน `/api/media/<assetId>`
 * จึงไม่มีรูปฝังเป็น data: URL ที่ทำให้เอกสารบวมและเล็ดลอดการตรวจชนิดไฟล์
 *
 * โหมดแก้โค้ด HTML และการวางจาก Word/เว็บ ผ่าน parser ของ Tiptap ตาม schema ข้างล่าง —
 * แท็ก/attribute ที่ไม่รู้จัก (`<script>`, `style`, `on*`) หายไปก่อนถึง JSON
 */

type DialogState = { kind: "closed" } | { kind: ToolbarDialog };

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      protocols: ["http", "https"],
      HTMLAttributes: { rel: "noopener noreferrer" },
    },
  }),
  SizedImage,
  TableKit.configure({ table: { resizable: false } }),
  Youtube.configure({ nocookie: true, width: 640, height: 360 }),
  TextAlign.configure({ types: ["heading", "paragraph"], alignments: [...TEXT_ALIGNS], defaultAlignment: "left" }),
  Subscript,
  Superscript,
  TextColorMark,
  NamedHighlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Details.configure({ persist: false, HTMLAttributes: { class: "rt-details" } }),
  DetailsSummary,
  DetailsContent,
  Callout,
];

/** ตัวนับคำ/ตัวอักษร — ตัดคำไทยด้วย Intl.Segmenter (CharacterCount ของ Tiptap นับตามช่องว่าง) */
function WordCount({ editor }: { editor: Editor }) {
  const text = useEditorState({ editor, selector: ({ editor: e }) => e.getText() });
  const deferred = React.useDeferredValue(text);
  const words = React.useMemo(() => countWords(deferred), [deferred]);
  return (
    <p className="text-muted-foreground border-line border-t px-3.5 py-1.5 text-right text-[11.5px] tabular-nums" aria-live="off">
      {words.toLocaleString("th-TH")} คำ · {deferred.length.toLocaleString("th-TH")} ตัวอักษร
    </p>
  );
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
  const [fullscreen, setFullscreen] = React.useState(false);
  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const [htmlDraft, setHtmlDraft] = React.useState("");
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fieldId = React.useId();

  const editor = useEditor({
    // Next render ฝั่ง server ก่อนเสมอ — ถ้าให้ Tiptap render ทันทีจะเกิด hydration mismatch
    immediatelyRender: false,
    extensions: EXTENSIONS,
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

  // ออกจากเต็มจอด้วย Esc/ปุ่มของเบราว์เซอร์ → state ต้องตามให้ทัน
  React.useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === frame);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [frame]);

  /**
   * เต็มจอด้วย Fullscreen API — editor มักอยู่ใน dialog ที่ใช้ transform จัดกึ่งกลาง
   * ซึ่งทำให้ `position: fixed` เต็มจอไม่ได้ · เบราว์เซอร์ที่ไม่รองรับ (iPhone) ใช้ CSS แทน
   */
  async function toggleFullscreen() {
    if (!frame) return;
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    } else if (frame.requestFullscreen && document.fullscreenEnabled) {
      await frame.requestFullscreen().catch(() => setFullscreen(true));
    } else {
      setFullscreen(true);
    }
    editor?.commands.focus();
  }

  function openDialog(kind: ToolbarDialog) {
    if (kind === "html" && editor) setHtmlDraft(prettyHtml(editor.getHTML()));
    setDialog({ kind });
  }

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

  const urlDialog = dialog.kind === "link" || dialog.kind === "youtube";

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
        ref={setFrame}
        data-fullscreen={fullscreen || undefined}
        className={cn(
          "bg-card border-border flex flex-col overflow-hidden rounded-[9px] border",
          error && "border-danger-fg",
          // ใช้ทั้งตอน Fullscreen API และตอนตกไปใช้ CSS
          "data-[fullscreen]:fixed data-[fullscreen]:inset-0 data-[fullscreen]:z-[60] data-[fullscreen]:rounded-none data-[fullscreen]:border-0",
        )}
      >
        <RichTextToolbar
          editor={editor}
          uploading={uploading}
          fullscreen={fullscreen}
          portalContainer={fullscreen ? frame : null}
          onPickImage={() => imageInputRef.current?.click()}
          onOpenDialog={openDialog}
          onToggleFullscreen={() => void toggleFullscreen()}
        />

        <div className={cn(fullscreen && "flex-1 overflow-y-auto")}>
          <EditorContent
            editor={editor}
            data-placeholder={placeholder}
            style={{ minHeight }}
            className={cn(
              "px-3.5 py-3 text-[14px] leading-[1.75]",
              fullscreen && "mx-auto w-full max-w-3xl px-6 py-6",
              "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
              "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[20px] [&_h1]:font-bold",
              "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-semibold",
              "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold",
              "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
              // node view ของ TaskItem ไม่ใส่ data-type ที่ <li> — เลือกจาก <ul> แม่แทน
              "[&_ul[data-type=taskList]>li]:flex [&_ul[data-type=taskList]>li]:items-start [&_ul[data-type=taskList]>li]:gap-2",
              "[&_ul[data-type=taskList]>li>label]:mt-[0.3em] [&_ul[data-type=taskList]>li>div]:min-w-0 [&_ul[data-type=taskList]>li>div]:flex-1",
              "[&_blockquote]:border-ring/50 [&_blockquote]:text-muted-foreground [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:pl-4",
              "[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-[13px]",
              "[&_img]:border-line [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border",
              "[&_img.ProseMirror-selectednode]:ring-ring [&_img.ProseMirror-selectednode]:ring-2",
              "[&_iframe]:border-line [&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg [&_iframe]:border",
              "[&_table]:border-line [&_table]:my-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:border",
              "[&_td]:border-line [&_td]:border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
              "[&_th]:border-line [&_th]:bg-muted [&_th]:border [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
              "[&_.selectedCell]:bg-accent/60",
              "[&_.rt-details]:border-line [&_.rt-details]:my-3 [&_.rt-details]:flex [&_.rt-details]:gap-1 [&_.rt-details]:rounded-lg [&_.rt-details]:border [&_.rt-details]:px-3 [&_.rt-details]:py-2",
              "[&_.rt-details>button]:mt-1 [&_.rt-details>button]:size-5 [&_.rt-details>button]:shrink-0 [&_.rt-details>button]:before:content-['▸'] [&_.rt-details.is-open>button]:before:content-['▾']",
              "[&_.rt-details>div]:min-w-0 [&_.rt-details>div]:flex-1 [&_.rt-details_summary]:font-semibold [&_.rt-details_summary]:list-none",
              "[&_a]:text-ring [&_a]:underline",
              "[&_hr]:border-line [&_hr]:my-5",
            )}
          />
        </div>

        <WordCount editor={editor} />
      </div>

      {error ? (
        <p role="alert" className="text-danger-fg text-[12px] font-medium">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-[11.5px]">{hint}</p>
      ) : null}

      {/* ใช้ dialog แทน window.prompt เพราะ prompt บล็อกทั้งหน้าและใช้กับคีย์บอร์ด/สกรีนรีดเดอร์ได้ไม่ดี */}
      <Dialog open={urlDialog} onOpenChange={(open) => (open ? null : setDialog({ kind: "closed" }))}>
        <DialogContent container={fullscreen ? frame : null} className="sm:max-w-[420px]">
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
              <DialogTitle>{dialog.kind === "youtube" ? "ฝังวิดีโอ YouTube" : "แทรกลิงก์"}</DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <Field
                label={dialog.kind === "youtube" ? "ลิงก์วิดีโอ" : "ที่อยู่ลิงก์"}
                name="url"
                type="url"
                defaultValue={dialog.kind === "link" ? (editor.getAttributes("link").href ?? "") : ""}
                placeholder={dialog.kind === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://example.com"}
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

      {/* FR-05.10 — ข้อความแทนรูป (alt) สำหรับโปรแกรมอ่านหน้าจอ */}
      <Dialog open={dialog.kind === "alt"} onOpenChange={(open) => (open ? null : setDialog({ kind: "closed" }))}>
        <DialogContent container={fullscreen ? frame : null} className="sm:max-w-[420px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const alt = String(new FormData(event.currentTarget).get("alt") ?? "").trim().slice(0, 200);
              editor.chain().focus().updateAttributes("image", { alt }).run();
              setDialog({ kind: "closed" });
            }}
          >
            <DialogHeader>
              <DialogTitle>ข้อความแทนรูป</DialogTitle>
              <DialogDescription>อธิบายรูปสั้น ๆ ให้ผู้ใช้โปรแกรมอ่านหน้าจอ · รูปตกแต่งเว้นว่างได้</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Field
                label="คำอธิบายรูป"
                name="alt"
                maxLength={200}
                defaultValue={editor.getAttributes("image").alt ?? ""}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ kind: "closed" })}>
                ยกเลิก
              </Button>
              <Button type="submit">บันทึก</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FR-05.10 — แก้โค้ด HTML: parse กลับเป็น JSON ตาม schema ไม่ได้ฝัง HTML ดิบ */}
      <Dialog open={dialog.kind === "html"} onOpenChange={(open) => (open ? null : setDialog({ kind: "closed" }))}>
        <DialogContent container={fullscreen ? frame : null} className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>แก้โค้ด HTML</DialogTitle>
            <DialogDescription>
              รองรับเฉพาะแท็กที่ตัวเขียนเนื้อหามีอยู่ แท็กอื่น สคริปต์ และ style จะถูกตัดออกเมื่อกดใช้
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={`${fieldId}-html`} className="sr-only">
            โค้ด HTML
          </label>
          <textarea
            id={`${fieldId}-html`}
            value={htmlDraft}
            onChange={(event) => setHtmlDraft(event.currentTarget.value)}
            spellCheck={false}
            className="border-border bg-background focus-visible:ring-ring h-[50vh] w-full resize-y rounded-lg border p-3 font-mono text-[12.5px] leading-[1.6] focus-visible:ring-2 focus-visible:outline-none"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog({ kind: "closed" })}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={() => {
                editor.chain().focus().setContent(htmlDraft, { emitUpdate: true }).run();
                setDialog({ kind: "closed" });
              }}
            >
              ใช้โค้ดนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RichTextEditor;
