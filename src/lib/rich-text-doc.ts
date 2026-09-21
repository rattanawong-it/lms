/**
 * FR-05.4 · NFR §9 Security — ตรวจและทำความสะอาด Tiptap JSON **ฝั่ง server**
 *
 * JSON ที่ส่งมาจากเบราว์เซอร์เชื่อไม่ได้ ต่อให้ editor ฝั่ง client จะจำกัดไว้แล้วก็ตาม
 * ไฟล์นี้จึงประกอบเอกสารชุดใหม่ขึ้นมาจากค่าที่ผ่าน allowlist เท่านั้น
 * node/mark/attr ที่ไม่รู้จักถูกทิ้ง ไม่ใช่ปล่อยผ่าน และผลลัพธ์คือสิ่งที่เขียนลง DB
 *
 * ไฟล์นี้ต้องไม่ import อะไรที่เป็น server-only — unit test เรียกตรง ๆ ได้
 */

export type RichMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; attrs: { href: string } };

export type RichNode = {
  type: string;
  text?: string;
  marks?: RichMark[];
  attrs?: Record<string, string | number | null>;
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

type MarkType = "bold" | "italic" | "underline" | "strike" | "code" | "link";
const MARK_TYPES: readonly MarkType[] = ["bold", "italic", "underline", "strike", "code", "link"];

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
    if (typeof type !== "string" || !MARK_TYPES.includes(type as MarkType)) continue;

    if (type === "link") {
      const href = safeLinkHref(asRecord(mark.attrs).href);
      // href ไม่ผ่าน → ทิ้งเฉพาะ mark แต่คงข้อความไว้ ผู้อ่านยังได้เนื้อหาครบ
      if (href) out.push({ type: "link", attrs: { href } });
      continue;
    }
    out.push({ type: type as Exclude<MarkType, "link"> });
  }

  return out.length > 0 ? out : undefined;
}

type AttrCleaner = (attrs: Record<string, unknown>) => Record<string, string | number | null> | null;

/** node ที่รับได้และวิธีเตรียม attrs ของแต่ละชนิด — นอกรายการนี้ถูกทิ้งทั้งหมด */
const BLOCK_SPECS: Record<string, { attrs?: AttrCleaner; leaf?: boolean }> = {
  paragraph: {},
  blockquote: {},
  bulletList: {},
  orderedList: {},
  listItem: {},
  table: {},
  tableRow: {},
  horizontalRule: { leaf: true },
  hardBreak: { leaf: true },

  heading: {
    attrs: (attrs) => ({ level: intInRange(attrs.level, 1, 3) ?? 2 }),
  },
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
      return { src, alt: typeof attrs.alt === "string" ? attrs.alt.slice(0, 200) : "" };
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
  if (!spec.leaf && content.length === 0 && type !== "paragraph") return null;

  return {
    type,
    ...(attrs ? { attrs } : {}),
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

/** URL ของรูปในเนื้อหา — ใช้ร่วมกันทั้ง editor, ตัวตรวจ และตัว render */
export function mediaSrc(assetId: string): string {
  return `/api/media/${assetId}`;
}
