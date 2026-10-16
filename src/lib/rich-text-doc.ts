/**
 * FR-05.4 · NFR §9 Security — ตรวจและทำความสะอาด Tiptap JSON **ฝั่ง server**
 *
 * JSON ที่ส่งมาจากเบราว์เซอร์เชื่อไม่ได้ ต่อให้ editor ฝั่ง client จะจำกัดไว้แล้วก็ตาม
 * ไฟล์นี้จึงประกอบเอกสารชุดใหม่ขึ้นมาจากค่าที่ผ่าน allowlist เท่านั้น
 * node/mark/attr ที่ไม่รู้จักถูกทิ้ง ไม่ใช่ปล่อยผ่าน และผลลัพธ์คือสิ่งที่เขียนลง DB
 *
 * ไฟล์นี้ต้องไม่ import อะไรที่เป็น server-only — unit test เรียกตรง ๆ ได้
 * ค่าที่ยอมรับของสี/ตำแหน่ง/ขนาด (FR-05.10) อยู่ใน `rich-text-styles.ts` ชุดเดียวกับตัว render
 */
import {
  CALLOUT_TONES,
  HIGHLIGHT_COLORS,
  IMAGE_ALIGNS,
  IMAGE_WIDTHS,
  TEXT_ALIGNS,
  TEXT_COLORS,
  pick,
} from "@/lib/rich-text-styles";

export type RichMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" | "superscript" | "subscript" }
  | { type: "link"; attrs: { href: string } }
  | { type: "textColor" | "highlight"; attrs: { color: string } };

export type RichNode = {
  type: string;
  text?: string;
  marks?: RichMark[];
  attrs?: Record<string, string | number | boolean | null>;
  content?: RichNode[];
};

export type RichTextDoc = { type: "doc"; content: RichNode[] };

/** เพดานกันเอกสารที่ใหญ่หรือซ้อนลึกจนทำให้ทั้งการ render และ DB ทำงานหนักเกินเหตุ */
const MAX_DEPTH = 12;
const MAX_NODES = 4_000;
const MAX_TEXT_LENGTH = 20_000;

/** รูปในเนื้อหาชี้ไปที่ route ของระบบเท่านั้น — ไม่รับ URL ภายนอกและไม่รับ data: */
const MEDIA_SRC = /^\/api\/media\/[a-z0-9]{10,40}$/;

/** โดเมนที่ฝังวิดีโอได้ — ต้องตรงกับ CSP frame-src ที่จะตั้งในขั้น 6 */
const EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
];

type SimpleMark = "bold" | "italic" | "underline" | "strike" | "code" | "superscript" | "subscript";
const SIMPLE_MARKS: readonly SimpleMark[] = ["bold", "italic", "underline", "strike", "code", "superscript", "subscript"];

/** ลิงก์ที่ยอมรับ — http/https หรือ path ภายในระบบ (กัน javascript: และ data:) */
export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeEmbedSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return EMBED_HOSTS.includes(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** จำนวนเต็มในช่วงที่กำหนด — ใช้กับระดับหัวข้อ colspan/rowspan และขนาดวิดีโอ */
function intInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : null;
}

function cleanMarks(value: unknown): RichMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RichMark[] = [];

  for (const raw of value) {
    const mark = asRecord(raw);
    const type = mark.type;

    if (type === "link") {
      const href = safeLinkHref(asRecord(mark.attrs).href);
      // href ไม่ผ่าน → ทิ้งเฉพาะ mark แต่คงข้อความไว้ ผู้อ่านยังได้เนื้อหาครบ
      if (href) out.push({ type: "link", attrs: { href } });
      continue;
    }
    // FR-05.10 — สีเป็นชื่อจากชุดที่กำหนดเท่านั้น ค่า CSS อื่นทิ้งทั้ง mark
    if (type === "textColor" || type === "highlight") {
      const raw = asRecord(mark.attrs).color;
      const color = type === "textColor" ? pick(TEXT_COLORS, raw) : pick(HIGHLIGHT_COLORS, raw);
      if (color) out.push({ type, attrs: { color } });
      continue;
    }
    if (typeof type === "string" && SIMPLE_MARKS.includes(type as SimpleMark)) {
      out.push({ type: type as SimpleMark });
    }
  }

  return out.length > 0 ? out : undefined;
}

type AttrCleaner = (attrs: Record<string, unknown>) => Record<string, string | number | boolean | null> | null;

/** การจัดตำแหน่ง (FR-05.10) — เก็บเฉพาะเมื่อไม่ใช่ค่าตั้งต้น เอกสารเดิมจึงไม่เปลี่ยน */
const alignAttrs = (attrs: Record<string, unknown>): Record<string, string> => {
  const textAlign = pick(TEXT_ALIGNS, attrs.textAlign);
  return textAlign && textAlign !== "left" ? { textAlign } : {};
};

/**
 * node ที่รับได้และวิธีเตรียม attrs ของแต่ละชนิด — นอกรายการนี้ถูกทิ้งทั้งหมด
 * `keepEmpty` = block ที่ schema ของ editor ยอมให้ว่าง (ทิ้งแล้วโหลดกลับเข้า editor ไม่ได้)
 */
const BLOCK_SPECS: Record<string, { attrs?: AttrCleaner; leaf?: boolean; keepEmpty?: boolean }> = {
  paragraph: { attrs: alignAttrs, keepEmpty: true },
  blockquote: {},
  bulletList: {},
  orderedList: {},
  listItem: {},
  table: {},
  tableRow: {},
  horizontalRule: { leaf: true },
  hardBreak: { leaf: true },

  heading: {
    attrs: (attrs) => ({ level: intInRange(attrs.level, 1, 3) ?? 2, ...alignAttrs(attrs) }),
  },

  // FR-05.10 — เช็คลิสต์ (แสดงอย่างเดียว) · กล่องเน้น · กล่องพับ
  taskList: {},
  taskItem: { attrs: (attrs) => ({ checked: attrs.checked === true }) },
  callout: { attrs: (attrs) => ({ tone: pick(CALLOUT_TONES, attrs.tone) ?? "info" }) },
  details: {},
  detailsSummary: { keepEmpty: true },
  detailsContent: {},
  codeBlock: {
    attrs: (attrs) => ({
      language:
        typeof attrs.language === "string" && /^[a-z0-9+#-]{1,20}$/i.test(attrs.language)
          ? attrs.language.toLowerCase()
          : null,
    }),
  },
  image: {
    leaf: true,
    attrs: (attrs) => {
      const src = typeof attrs.src === "string" && MEDIA_SRC.test(attrs.src) ? attrs.src : null;
      if (!src) return null; // รูปที่ชี้ออกนอกระบบ → ทิ้งทั้ง node
      return {
        src,
        alt: typeof attrs.alt === "string" ? attrs.alt.slice(0, 200) : "",
        // FR-05.10 — ขนาด/ตำแหน่งจากชุดที่กำหนด · ไม่ระบุ = แบบเดิม (กว้างตามรูป ชิดซ้าย)
        ...(pick(IMAGE_WIDTHS, attrs.width) ? { width: attrs.width as string } : {}),
        ...(pick(IMAGE_ALIGNS, attrs.align) ? { align: attrs.align as string } : {}),
      };
    },
  },
  youtube: {
    leaf: true,
    attrs: (attrs) => {
      const src = safeEmbedSrc(attrs.src);
      if (!src) return null;
      return {
        src,
        width: intInRange(attrs.width, 120, 1920) ?? 640,
        height: intInRange(attrs.height, 80, 1080) ?? 360,
      };
    },
  },
  tableHeader: {
    attrs: (attrs) => ({
      colspan: intInRange(attrs.colspan, 1, 20) ?? 1,
      rowspan: intInRange(attrs.rowspan, 1, 20) ?? 1,
    }),
  },
};
BLOCK_SPECS.tableCell = BLOCK_SPECS.tableHeader;

/** งบประมาณระหว่างเดินต้นไม้ — นับ node ที่ผ่านแล้วเพื่อหยุดเมื่อถึงเพดาน */
type Budget = { nodes: number };

function cleanNodes(value: unknown, depth: number, budget: Budget): RichNode[] {
  if (!Array.isArray(value) || depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];

  for (const raw of value) {
    if (budget.nodes >= MAX_NODES) break;
    const node = cleanNode(raw, depth, budget);
    if (node) out.push(node);
  }

  return out;
}

function cleanNode(raw: unknown, depth: number, budget: Budget): RichNode | null {
  const node = asRecord(raw);
  const type = node.type;
  if (typeof type !== "string") return null;

  if (type === "text") {
    const text = typeof node.text === "string" ? node.text.slice(0, MAX_TEXT_LENGTH) : "";
    if (!text) return null;
    budget.nodes += 1;
    const marks = cleanMarks(node.marks);
    return marks ? { type: "text", text, marks } : { type: "text", text };
  }

  const spec = BLOCK_SPECS[type];
  if (!spec) return null;

  const attrs = spec.attrs?.(asRecord(node.attrs));
  if (spec.attrs && attrs === null) return null;

  budget.nodes += 1;
  const content = spec.leaf ? [] : cleanNodes(node.content, depth + 1, budget);

  // block ที่ไม่ใช่ leaf และไม่เหลือเนื้อหาข้างใน → ทิ้ง ยกเว้นย่อหน้าว่างที่ใช้เว้นบรรทัด
  if (!spec.leaf && content.length === 0 && !spec.keepEmpty) return null;

  return {
    type,
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

/** มีข้อความหรือสื่ออย่างน้อยหนึ่งอย่างไหม — ย่อหน้าว่างล้วนไม่นับว่ามีเนื้อหา */
function hasContent(nodes: RichNode[]): boolean {
  for (const node of nodes) {
    if (node.type === "text" && node.text?.trim()) return true;
    if (node.type === "image" || node.type === "youtube" || node.type === "horizontalRule") {
      return true;
    }
    if (node.content && hasContent(node.content)) return true;
  }
  return false;
}

/**
 * แปลงค่าที่รับมาให้เป็นเอกสารที่ปลอดภัย
 * คืน `null` เมื่อไม่ใช่เอกสาร หรือไม่เหลือเนื้อหาเลย (ผู้ใช้ล้างเนื้อหาทิ้ง)
 */
export function parseRichTextDoc(value: unknown): RichTextDoc | null {
  const doc = asRecord(value);
  if (doc.type !== "doc") return null;

  const content = cleanNodes(doc.content, 1, { nodes: 0 });
  if (content.length === 0 || !hasContent(content)) return null;
  return { type: "doc", content };
}

/** อ่านค่าจากฟอร์ม (สตริง JSON) แล้วส่งต่อให้ตัวตรวจ — JSON เสียถือว่าไม่มีเนื้อหา */
export function parseRichTextField(value: FormDataEntryValue | null): RichTextDoc | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return parseRichTextDoc(JSON.parse(value));
  } catch {
    return null;
  }
}

/** รูปที่ชี้ไปที่ route ของระบบหรือไม่ — editor ใช้ทิ้งรูปจากโดเมนนอกตั้งแต่ตอนวาง/แก้ HTML */
export function isMediaSrc(value: unknown): boolean {
  return typeof value === "string" && MEDIA_SRC.test(value);
}

/** URL ของรูปในเนื้อหา — ใช้ร่วมกันทั้ง editor, ตัวตรวจ และตัว render */
export function mediaSrc(assetId: string): string {
  return `/api/media/${assetId}`;
}

/**
 * ข้อความล้วน → เอกสาร Tiptap (ย่อหน้าละบรรทัด) — ใช้กับข้อมูลที่นำเข้าจาก CSV/Excel
 * ผลลัพธ์ผ่าน `parseRichTextDoc()` อีกรอบ จึงได้เพดานความยาวชุดเดียวกับที่พิมพ์ใน editor
 */
export function plainTextToDoc(text: string): RichTextDoc | null {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  return parseRichTextDoc({
    type: "doc",
    content: paragraphs.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  });
}
