import { Mark, Node, mergeAttributes } from "@tiptap/react";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import {
  CALLOUT_TONES,
  HIGHLIGHT_COLORS,
  IMAGE_ALIGNS,
  IMAGE_WIDTHS,
  TEXT_COLORS,
  pick,
  type CalloutTone,
  type HighlightColor,
  type ImageAlign,
  type ImageWidth,
  type TextColor,
} from "@/lib/rich-text-styles";
import { cn } from "@/lib/utils";
import { isMediaSrc } from "@/lib/rich-text-doc";

/**
 * FR-05.10 — extension ของ editor ที่เก็บสี/ขนาด/โทนเป็น **ชื่อ** (system-design §8.4)
 *
 * ใน editor แสดงด้วย class ชุดเดียวกับตัว render (`rich-text-styles.ts`)
 * และอ่านกลับจาก `data-*` เท่านั้น — HTML ที่วางมาจาก Word/เว็บ (`style="color:#123"`)
 * จึงไม่กลายเป็นสีอิสระในเอกสาร
 */

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: TextColor) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    callout: {
      toggleCallout: (tone: CalloutTone) => ReturnType;
      setCalloutTone: (tone: CalloutTone) => ReturnType;
    };
  }
}

export const TextColorMark = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => pick(TEXT_COLORS, element.getAttribute("data-color")),
        renderHTML: (attrs) => {
          const color = pick(TEXT_COLORS, attrs.color);
          return color ? { "data-color": color, class: TEXT_COLORS[color].className } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-color]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-text-color": "" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/** ไฮไลต์หลายสี — แทน `style="background-color"` ของต้นฉบับด้วย class ตามชื่อสี */
export const NamedHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (element) => pick(HIGHLIGHT_COLORS, element.getAttribute("data-color")) ?? "yellow",
        renderHTML: (attrs) => {
          const color: HighlightColor = pick(HIGHLIGHT_COLORS, attrs.color) ?? "yellow";
          return { "data-color": color, class: cn("rounded-sm px-0.5 text-inherit", HIGHLIGHT_COLORS[color].className) };
        },
      },
    };
  },
}).configure({ multicolor: true });

/** กล่องเน้นข้อความ (ข้อมูล/คำเตือน/สำเร็จ) — ครอบ block อื่นได้ */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (element) => pick(CALLOUT_TONES, element.getAttribute("data-callout")) ?? "info",
        renderHTML: (attrs) => {
          const tone: CalloutTone = pick(CALLOUT_TONES, attrs.tone) ?? "info";
          return {
            "data-callout": tone,
            class: cn("my-3 rounded-lg border-l-4 px-4 py-3", CALLOUT_TONES[tone].className),
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      toggleCallout:
        (tone) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tone }),
      setCalloutTone:
        (tone) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { tone }),
    };
  },
});

/**
 * รูปที่เลือกขนาด (เล็ก/กลาง/เต็ม) และตำแหน่ง (ซ้าย/กลาง/ขวา) ได้
 * รับเฉพาะรูปที่อัปโหลดเข้าระบบ (`/api/media/*`) — รูปจากเว็บอื่นที่วาง/แก้ใน HTML ถูกทิ้งเหมือนฝั่ง server
 */
export const SizedImage = Image.extend({
  parseHTML() {
    return [{ tag: "img[src]", getAttrs: (element) => (isMediaSrc(element.getAttribute("src")) ? null : false) }];
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => pick(IMAGE_WIDTHS, element.getAttribute("data-width")),
        renderHTML: (attrs) => {
          const width: ImageWidth | null = pick(IMAGE_WIDTHS, attrs.width);
          return width ? { "data-width": width, class: cn("block", IMAGE_WIDTHS[width].className) } : {};
        },
      },
      align: {
        default: null,
        parseHTML: (element) => pick(IMAGE_ALIGNS, element.getAttribute("data-align")),
        renderHTML: (attrs) => {
          const align: ImageAlign | null = pick(IMAGE_ALIGNS, attrs.align);
          return align ? { "data-align": align, class: cn("block", IMAGE_ALIGNS[align].className) } : {};
        },
      },
    };
  },
}).configure({ allowBase64: false });
