import * as React from "react";
import { Info, CircleCheck, TriangleAlert } from "lucide-react";
import { safeLinkHref } from "@/lib/rich-text-doc";
import {
  CALLOUT_TONES,
  HIGHLIGHT_COLORS,
  IMAGE_ALIGNS,
  IMAGE_WIDTHS,
  TEXT_ALIGNS,
  TEXT_ALIGN_CLASS,
  TEXT_COLORS,
  pick,
  type CalloutTone,
} from "@/lib/rich-text-styles";
import { cn } from "@/lib/utils";

/**
 * แสดงเนื้อหา Tiptap JSON เป็น React element ตาม allowlist (NFR §9 Security)
 *
 * ไม่มีการแปลงเป็นสตริง HTML และไม่มี dangerouslySetInnerHTML ที่ไหนเลย
 * node หรือ mark ที่ไม่อยู่ในรายการอนุญาตจะถูกข้าม แทนที่จะปล่อยผ่าน
 *
 * เนื้อหาถูกกรองมาแล้วตั้งแต่ตอนบันทึกด้วย `lib/rich-text-doc.ts`
 * แต่ตัว render ยังตรวจซ้ำเอง เพราะข้อมูลเก่าใน DB อาจมาจากรุ่นก่อนหน้า
 */
type Mark = { type: string; attrs?: { href?: string; color?: string } };
type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: {
    level?: number;
    src?: string;
    alt?: string;
    /** youtube = พิกเซล · image = ชื่อขนาด (FR-05.10) */
    width?: number | string;
    height?: number;
    colspan?: number;
    rowspan?: number;
    language?: string | null;
    textAlign?: string;
    checked?: boolean;
    tone?: string;
    align?: string;
  };
  content?: Node[];
};

const HEADING_CLASS: Record<number, string> = {
  1: "text-[20px] font-bold mt-5 mb-2",
  2: "text-[17px] font-semibold mt-5 mb-2",
  3: "text-[15px] font-semibold mt-4 mb-1.5",
};

/** รูปในเนื้อหาต้องมาจาก route ของระบบเท่านั้น (ดู lib/rich-text-doc.ts) */
const MEDIA_SRC = /^\/api\/media\/[a-z0-9]{10,40}$/;

/** โดเมนที่ฝัง iframe ได้ — ตรงกับ allowlist ฝั่งบันทึกและ CSP frame-src */
const EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
];

function safeEmbedSrc(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return EMBED_HOSTS.includes(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function applyMarks(text: string, marks: Mark[] | undefined, key: string): React.ReactNode {
  let node: React.ReactNode = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "underline":
        node = <u>{node}</u>;
        break;
      case "strike":
        node = <s>{node}</s>;
        break;
      case "code":
        node = <code className="bg-muted rounded px-1 py-0.5 text-[0.9em]">{node}</code>;
        break;
      case "superscript":
        node = <sup>{node}</sup>;
        break;
      case "subscript":
        node = <sub>{node}</sub>;
        break;
      case "textColor": {
        const color = pick(TEXT_COLORS, mark.attrs?.color);
        if (color) node = <span className={TEXT_COLORS[color].className}>{node}</span>;
        break;
      }
      case "highlight": {
        const color = pick(HIGHLIGHT_COLORS, mark.attrs?.color);
        if (color) node = <mark className={cn("rounded-sm px-0.5 text-inherit", HIGHLIGHT_COLORS[color].className)}>{node}</mark>;
        break;
      }
      case "link": {
        const href = safeLinkHref(mark.attrs?.href);
        node = href ? (
          <a href={href} className="text-ring underline" rel="noopener noreferrer">
            {node}
          </a>
        ) : (
          node
        );
        break;
      }
      default:
        // mark ที่ไม่รู้จัก — คงข้อความไว้แต่ไม่ใส่รูปแบบใด ๆ
        break;
    }
  }
  return <React.Fragment key={key}>{node}</React.Fragment>;
}

/** class การจัดตำแหน่งของย่อหน้า/หัวข้อ — ค่าที่ไม่รู้จักถือเป็นชิดซ้าย */
function alignClass(node: Node): string | undefined {
  const align = pick(TEXT_ALIGNS, node.attrs?.textAlign);
  return align && align !== "left" ? TEXT_ALIGN_CLASS[align] : undefined;
}

const CALLOUT_ICON: Record<CalloutTone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
};

function renderNodes(nodes: Node[] | undefined, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];

  (nodes ?? []).forEach((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case "text":
        if (node.text) out.push(applyMarks(node.text, node.marks, key));
        break;

      case "paragraph":
        out.push(
          <p key={key} className={cn("text-[14px] leading-[1.75]", alignClass(node))}>
            {renderNodes(node.content, key)}
          </p>,
        );
        break;

      case "heading": {
        const level = Math.min(3, Math.max(1, node.attrs?.level ?? 2));
        const Tag = `h${level + 1}` as "h2" | "h3" | "h4";
        out.push(
          <Tag key={key} className={cn(HEADING_CLASS[level], alignClass(node))}>
            {renderNodes(node.content, key)}
          </Tag>,
        );
        break;
      }

      case "bulletList":
        out.push(
          <ul key={key} className="my-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.75]">
            {renderNodes(node.content, key)}
          </ul>,
        );
        break;

      case "orderedList":
        out.push(
          <ol key={key} className="my-2 list-decimal space-y-1 pl-5 text-[14px] leading-[1.75]">
            {renderNodes(node.content, key)}
          </ol>,
        );
        break;

      case "listItem":
        out.push(<li key={key}>{renderNodes(node.content, key)}</li>);
        break;

      case "taskList":
        out.push(
          <ul key={key} className="my-2 space-y-1 text-[14px] leading-[1.75]">
            {renderNodes(node.content, key)}
          </ul>,
        );
        break;

      case "taskItem": {
        const checked = node.attrs?.checked === true;
        out.push(
          <li key={key} className="flex items-start gap-2">
            {/* แสดงสถานะที่ผู้สอนตั้งไว้ — ผู้อ่านติ๊กเองไม่ได้ */}
            <input
              type="checkbox"
              checked={checked}
              readOnly
              disabled
              aria-label={checked ? "ทำแล้ว" : "ยังไม่ทำ"}
              className="accent-primary mt-[0.45em] size-4 shrink-0"
            />
            <div className={cn("min-w-0 flex-1", checked && "text-muted-foreground line-through")}>
              {renderNodes(node.content, key)}
            </div>
          </li>,
        );
        break;
      }

      case "callout": {
        const tone = pick(CALLOUT_TONES, node.attrs?.tone) ?? "info";
        const Icon = CALLOUT_ICON[tone];
        out.push(
          <div
            key={key}
            role="note"
            aria-label={CALLOUT_TONES[tone].label}
            className={cn("my-3 flex gap-2.5 rounded-lg border-l-4 px-4 py-3", CALLOUT_TONES[tone].className)}
          >
            <Icon className="mt-[0.3em] size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">{renderNodes(node.content, key)}</div>
          </div>,
        );
        break;
      }

      case "details": {
        const summary = node.content?.find((child) => child.type === "detailsSummary");
        const body = node.content?.find((child) => child.type === "detailsContent");
        out.push(
          <details key={key} className="border-line my-3 rounded-lg border px-4 py-2">
            <summary className="cursor-pointer py-1 text-[14px] font-semibold">
              {renderNodes(summary?.content, `${key}-s`)}
            </summary>
            <div className="pt-1 pb-1">{renderNodes(body?.content, `${key}-c`)}</div>
          </details>,
        );
        break;
      }

      case "blockquote":
        out.push(
          <blockquote
            key={key}
            className="border-ring/50 text-muted-foreground my-3 border-l-[3px] pl-4"
          >
            {renderNodes(node.content, key)}
          </blockquote>,
        );
        break;

      case "codeBlock":
        out.push(
          <pre
            key={key}
            className="bg-muted my-3 overflow-x-auto rounded-lg p-3 text-[13px] leading-[1.6]"
          >
            <code>{renderNodes(node.content, key)}</code>
          </pre>,
        );
        break;

      case "horizontalRule":
        out.push(<hr key={key} className="border-line my-5" />);
        break;

      case "image": {
        // ไม่ใช้ next/image เพราะขนาดจริงของรูปในบทความไม่รู้ล่วงหน้า
        // และ route /api/media ตั้ง Cache-Control ให้เบราว์เซอร์แคชเองอยู่แล้ว
        const src = node.attrs?.src;
        if (src && MEDIA_SRC.test(src)) {
          const width = pick(IMAGE_WIDTHS, node.attrs?.width);
          const align = pick(IMAGE_ALIGNS, node.attrs?.align);
          out.push(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={key}
              src={src}
              alt={node.attrs?.alt ?? ""}
              loading="lazy"
              className={cn(
                "border-line my-3 h-auto max-w-full rounded-lg border",
                (width || align) && "block",
                width && IMAGE_WIDTHS[width].className,
                align && IMAGE_ALIGNS[align].className,
              )}
            />,
          );
        }
        break;
      }

      case "youtube": {
        const src = safeEmbedSrc(node.attrs?.src);
        if (src) {
          out.push(
            <span key={key} className="bg-muted my-3 block aspect-video w-full overflow-hidden rounded-lg">
              <iframe
                src={src}
                title="วิดีโอประกอบเนื้อหา"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </span>,
          );
        }
        break;
      }

      case "table":
        out.push(
          <div key={key} className="border-line my-3 overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>{renderNodes(node.content, key)}</tbody>
            </table>
          </div>,
        );
        break;

      case "tableRow":
        out.push(
          <tr key={key} className="border-line border-b last:border-0">
            {renderNodes(node.content, key)}
          </tr>,
        );
        break;

      case "tableHeader":
        out.push(
          <th
            key={key}
            colSpan={node.attrs?.colspan}
            rowSpan={node.attrs?.rowspan}
            className="border-line bg-muted border-r px-3 py-2 text-left font-semibold last:border-0"
          >
            {renderNodes(node.content, key)}
          </th>,
        );
        break;

      case "tableCell":
        out.push(
          <td
            key={key}
            colSpan={node.attrs?.colspan}
            rowSpan={node.attrs?.rowspan}
            className="border-line border-r px-3 py-2 align-top last:border-0"
          >
            {renderNodes(node.content, key)}
          </td>,
        );
        break;

      case "hardBreak":
        out.push(<br key={key} />);
        break;

      default:
        // node ที่ยังไม่รองรับ — ลงลึกไปหาข้อความข้างใน ดีกว่าทิ้งเนื้อหาทั้งก้อน
        if (node.content) out.push(...renderNodes(node.content, key));
        break;
    }
  });

  return out;
}

export function RichText({ content, className }: { content: unknown; className?: string }) {
  if (!content || typeof content !== "object") return null;
  const doc = content as Node;
  const children = renderNodes(doc.content, "rt");
  if (children.length === 0) return null;
  return <div className={className}>{children}</div>;
}

/** ดึงข้อความล้วนออกมาใช้ทำ meta description (FR-03.5) */
export function richTextToPlain(content: unknown, limit = 200): string {
  if (!content || typeof content !== "object") return "";
  const out: string[] = [];

  const walk = (node: Node) => {
    if (node.text) out.push(node.text);
    for (const child of node.content ?? []) walk(child);
  };
  walk(content as Node);

  const text = out.join(" ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
