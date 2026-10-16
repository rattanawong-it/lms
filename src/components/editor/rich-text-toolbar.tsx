"use client";

import * as React from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  ChevronDown,
  ChevronsDownUp,
  Code,
  Code2,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Maximize2,
  MessageSquareWarning,
  Minimize2,
  Minus,
  MonitorPlay,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CALLOUT_TONES,
  HIGHLIGHT_COLORS,
  IMAGE_ALIGNS,
  IMAGE_WIDTHS,
  TEXT_ALIGNS,
  TEXT_COLORS,
  type CalloutTone,
  type HighlightColor,
  type ImageAlign,
  type ImageWidth,
  type TextAlign,
  type TextColor,
} from "@/lib/rich-text-styles";
import { cn } from "@/lib/utils";

/**
 * FR-05.4 · FR-05.10 — แถบเครื่องมือของ editor
 * แถวหลักแสดงตลอด · แถวตาราง/รูปแสดงเมื่อเคอร์เซอร์อยู่ในตารางหรือเลือกรูปอยู่
 */

export type ToolbarDialog = "link" | "youtube" | "html" | "alt";

const ALIGN_ICON: Record<TextAlign, React.ComponentType<{ className?: string }>> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
};
const ALIGN_LABEL: Record<TextAlign, string> = {
  left: "ชิดซ้าย",
  center: "กึ่งกลาง",
  right: "ชิดขวา",
  justify: "เต็มบรรทัด",
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
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
      className={cn("size-8", active && "bg-accent text-accent-foreground", className)}
      // กันปุ่มขโมยโฟกัสจาก editor — selection เดิมจึงยังอยู่ตอนสั่งคำสั่ง
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** ปุ่มเปิดเมนู — ใช้ trigger ของ Radix ตรง ๆ เพื่อให้คีย์บอร์ดเปิด/ปิดได้ */
function MenuButton({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={label}
        title={label}
        className={cn("h-8 gap-0.5 px-1.5", active && "bg-accent text-accent-foreground")}
      >
        {children}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </Button>
    </DropdownMenuTrigger>
  );
}

function Divider() {
  return <span className="bg-line mx-0.5 h-5 w-px" aria-hidden="true" />;
}

function useToolbarState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const align = (TEXT_ALIGNS.find((value) => e.isActive({ textAlign: value })) ?? "left") as TextAlign;
      const image = e.isActive("image") ? e.getAttributes("image") : null;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        superscript: e.isActive("superscript"),
        subscript: e.isActive("subscript"),
        code: e.isActive("code"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        taskList: e.isActive("taskList"),
        blockquote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        details: e.isActive("details"),
        callout: e.isActive("callout") ? ((e.getAttributes("callout").tone as CalloutTone) ?? "info") : null,
        link: e.isActive("link"),
        textColor: (e.getAttributes("textColor").color as TextColor | undefined) ?? null,
        highlight: e.isActive("highlight") ? ((e.getAttributes("highlight").color as HighlightColor) ?? "yellow") : null,
        align,
        inTable: e.isActive("table"),
        canMerge: e.can().mergeCells(),
        canSplit: e.can().splitCell(),
        image: image
          ? { width: (image.width as ImageWidth | null) ?? null, align: (image.align as ImageAlign | null) ?? null }
          : null,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
}

export function RichTextToolbar({
  editor,
  uploading,
  fullscreen,
  portalContainer,
  onPickImage,
  onOpenDialog,
  onToggleFullscreen,
}: {
  editor: Editor;
  uploading: boolean;
  fullscreen: boolean;
  /** กล่องที่เต็มจออยู่ — เมนูต้องเปิดข้างใน ไม่งั้นมองไม่เห็น */
  portalContainer: HTMLElement | null;
  onPickImage: () => void;
  onOpenDialog: (dialog: ToolbarDialog) => void;
  onToggleFullscreen: () => void;
}) {
  const state = useToolbarState(editor);
  const chain = () => editor.chain().focus();
  // Radix คืนโฟกัสให้ปุ่มเมนูเมื่อปิด — ผู้ใช้พิมพ์ต่อไม่ได้และ selection ค้างเป็นช่วง
  // คำสั่งถัดไป (เช่นแทรกตาราง) จะทับข้อความที่เลือกไว้ จึงส่งโฟกัสกลับ editor เอง
  const backToEditor = (event: Event) => {
    event.preventDefault();
    editor.commands.focus();
  };
  const AlignIcon = ALIGN_ICON[state.align];

  return (
    <div className="border-line bg-background sticky top-0 z-10 border-b">
      <div role="toolbar" aria-label="เครื่องมือจัดรูปแบบ" className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5">
        <ToolbarButton label="ตัวหนา" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ตัวเอียง" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ขีดเส้นใต้" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ขีดฆ่า" active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ตัวยก" active={state.superscript} onClick={() => chain().unsetSubscript().toggleSuperscript().run()}>
          <SuperscriptIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ตัวห้อย" active={state.subscript} onClick={() => chain().unsetSuperscript().toggleSubscript().run()}>
          <SubscriptIcon className="size-4" />
        </ToolbarButton>

        <DropdownMenu>
          <MenuButton label="สีตัวอักษร" active={state.textColor !== null}>
            <Baseline className={cn("size-4", state.textColor && TEXT_COLORS[state.textColor].className)} />
          </MenuButton>
          <DropdownMenuContent container={portalContainer} onCloseAutoFocus={backToEditor} className="w-40">
            {(Object.keys(TEXT_COLORS) as TextColor[]).map((color) => (
              <DropdownMenuItem key={color} onSelect={() => chain().setTextColor(color).run()}>
                <span className={cn("size-3.5 rounded-full", TEXT_COLORS[color].swatch)} aria-hidden />
                <span className={TEXT_COLORS[color].className}>{TEXT_COLORS[color].label}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => chain().unsetTextColor().run()}>
              <Type className="size-3.5" aria-hidden /> สีปกติ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <MenuButton label="ไฮไลต์" active={state.highlight !== null}>
            <Highlighter className="size-4" />
          </MenuButton>
          <DropdownMenuContent container={portalContainer} onCloseAutoFocus={backToEditor} className="w-40">
            {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
              <DropdownMenuItem key={color} onSelect={() => chain().setHighlight({ color }).run()}>
                <span className={cn("size-3.5 rounded-sm", HIGHLIGHT_COLORS[color].swatch)} aria-hidden />
                {HIGHLIGHT_COLORS[color].label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => chain().unsetHighlight().run()}>ไม่ไฮไลต์</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarButton label="ล้างรูปแบบ" onClick={() => chain().unsetAllMarks().clearNodes().unsetTextAlign().run()}>
          <RemoveFormatting className="size-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="หัวข้อใหญ่ (H1)" active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="หัวข้อ (H2)" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="หัวข้อย่อย (H3)" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-4" />
        </ToolbarButton>

        <DropdownMenu>
          <MenuButton label={`จัดตำแหน่ง: ${ALIGN_LABEL[state.align]}`} active={state.align !== "left"}>
            <AlignIcon className="size-4" />
          </MenuButton>
          <DropdownMenuContent container={portalContainer} onCloseAutoFocus={backToEditor} className="w-40">
            {TEXT_ALIGNS.map((align) => {
              const Icon = ALIGN_ICON[align];
              return (
                <DropdownMenuItem key={align} onSelect={() => chain().setTextAlign(align).run()}>
                  <Icon className="size-4" aria-hidden /> {ALIGN_LABEL[align]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Divider />

        <ToolbarButton label="รายการแบบจุด" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="รายการแบบตัวเลข" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="เช็คลิสต์" active={state.taskList} onClick={() => chain().toggleTaskList().run()}>
          <ListChecks className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ยกข้อความ" active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolbarButton>

        <DropdownMenu>
          <MenuButton label="กล่องเน้นข้อความ" active={state.callout !== null}>
            <MessageSquareWarning className="size-4" />
          </MenuButton>
          <DropdownMenuContent container={portalContainer} onCloseAutoFocus={backToEditor} className="w-44">
            {(Object.keys(CALLOUT_TONES) as CalloutTone[]).map((tone) => (
              <DropdownMenuItem
                key={tone}
                onSelect={() =>
                  state.callout ? chain().setCalloutTone(tone).run() : chain().toggleCallout(tone).run()
                }
              >
                <span className={cn("h-3.5 w-1 rounded-full border-l-4", CALLOUT_TONES[tone].className)} aria-hidden />
                กล่อง{CALLOUT_TONES[tone].label}
              </DropdownMenuItem>
            ))}
            {state.callout ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => chain().lift("callout").run()}>เอากล่องออก</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarButton
          label={state.details ? "เอากล่องพับออก" : "กล่องพับ/ขยาย"}
          active={state.details}
          onClick={() => (state.details ? chain().unsetDetails().run() : chain().setDetails().run())}
        >
          <ChevronsDownUp className="size-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="โค้ดในบรรทัด" active={state.code} onClick={() => chain().toggleCode().run()}>
          <Code className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="บล็อกโค้ด" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
          <Code2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="เส้นคั่น" onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label={state.link ? "แก้ไขลิงก์" : "แทรกลิงก์"} active={state.link} onClick={() => onOpenDialog("link")}>
          <Link2 className="size-4" />
        </ToolbarButton>
        {state.link ? (
          <ToolbarButton label="เอาลิงก์ออก" onClick={() => chain().unsetLink().run()}>
            <Link2Off className="size-4" />
          </ToolbarButton>
        ) : null}
        <ToolbarButton label="แทรกรูป" disabled={uploading} onClick={onPickImage}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        </ToolbarButton>
        <ToolbarButton label="ฝังวิดีโอ" onClick={() => onOpenDialog("youtube")}>
          <MonitorPlay className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="แทรกตาราง 3×3"
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="size-4" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="ย้อนกลับ" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="ทำซ้ำ" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="แก้โค้ด HTML" onClick={() => onOpenDialog("html")}>
          <FileCode className="size-4" />
        </ToolbarButton>
        <ToolbarButton label={fullscreen ? "ออกจากโหมดเต็มจอ" : "เต็มจอ"} active={fullscreen} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </ToolbarButton>
      </div>

      {state.inTable ? (
        <div
          role="toolbar"
          aria-label="เครื่องมือตาราง"
          className="border-line flex flex-wrap items-center gap-0.5 border-t px-1.5 py-1"
        >
          <span className="text-muted-foreground px-1.5 text-[11.5px] font-medium">ตาราง</span>
          <ToolbarButton label="แทรกแถวด้านบน" onClick={() => chain().addRowBefore().run()}>
            <BetweenHorizontalStart className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="แทรกแถวด้านล่าง" onClick={() => chain().addRowAfter().run()}>
            <BetweenHorizontalEnd className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="ลบแถว" onClick={() => chain().deleteRow().run()}>
            <Rows3 className="text-danger-fg size-4" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="แทรกคอลัมน์ด้านซ้าย" onClick={() => chain().addColumnBefore().run()}>
            <BetweenVerticalStart className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="แทรกคอลัมน์ด้านขวา" onClick={() => chain().addColumnAfter().run()}>
            <BetweenVerticalEnd className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="ลบคอลัมน์" onClick={() => chain().deleteColumn().run()}>
            <Rows3 className="text-danger-fg size-4 rotate-90" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="รวมเซลล์" disabled={!state.canMerge} onClick={() => chain().mergeCells().run()}>
            <TableCellsMerge className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="แยกเซลล์" disabled={!state.canSplit} onClick={() => chain().splitCell().run()}>
            <TableCellsSplit className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="เปิด/ปิดแถวหัวตาราง" onClick={() => chain().toggleHeaderRow().run()}>
            <TableIcon className="size-4" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton label="ลบตาราง" onClick={() => chain().deleteTable().run()}>
            <Trash2 className="text-danger-fg size-4" />
          </ToolbarButton>
        </div>
      ) : null}

      {state.image ? (
        <div
          role="toolbar"
          aria-label="เครื่องมือรูปภาพ"
          className="border-line flex flex-wrap items-center gap-1 border-t px-1.5 py-1"
        >
          <span className="text-muted-foreground px-1.5 text-[11.5px] font-medium">รูป</span>
          {(Object.keys(IMAGE_WIDTHS) as ImageWidth[]).map((width) => (
            <Button
              key={width}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={state.image?.width === width}
              className={cn("h-8 px-2 text-[12px]", state.image?.width === width && "bg-accent text-accent-foreground")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chain().updateAttributes("image", { width }).run()}
            >
              {IMAGE_WIDTHS[width].label}
            </Button>
          ))}
          <Divider />
          {(Object.keys(IMAGE_ALIGNS) as ImageAlign[]).map((align) => {
            const Icon = ALIGN_ICON[align];
            return (
              <ToolbarButton
                key={align}
                label={`รูป${IMAGE_ALIGNS[align].label}`}
                active={state.image?.align === align}
                onClick={() => chain().updateAttributes("image", { align }).run()}
              >
                <Icon className="size-4" />
              </ToolbarButton>
            );
          })}
          <Divider />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[12px]"
            onClick={() => onOpenDialog("alt")}
          >
            ข้อความแทนรูป
          </Button>
        </div>
      ) : null}
    </div>
  );
}
