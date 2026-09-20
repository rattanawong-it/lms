import * as React from "react";

/**
 * แสดงเนื้อหา Tiptap JSON เป็น React element ตาม allowlist (NFR §9 Security)
 *
 * ไม่มีการแปลงเป็นสตริง HTML และไม่มี dangerouslySetInnerHTML ที่ไหนเลย
 * node หรือ mark ที่ไม่อยู่ในรายการอนุญาตจะถูกข้าม แทนที่จะปล่อยผ่าน
 *
 * ขั้นนี้รองรับเท่าที่หน้ารายละเอียดคอร์สต้องใช้ ส่วนตาราง รูป และโค้ดบล็อก
 * จะเพิ่มพร้อมกับ Tiptap editor ในขั้น 4 (FR-05.4)
 */
type Mark = { type: string; attrs?: { href?: string; target?: string } };
type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number };
  content?: Node[];
};

const HEADING_CLASS: Record<number, string> = {
  1: "text-[20px] font-bold mt-5 mb-2",
  2: "text-[17px] font-semibold mt-5 mb-2",
  3: "text-[15px] font-semibold mt-4 mb-1.5",
};

/** ลิงก์ที่ยอมรับ — http/https และ path ภายในระบบเท่านั้น (กัน javascript: และ data:) */
function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
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
      case "code":
        node = <code className="bg-muted rounded px-1 py-0.5 text-[0.9em]">{node}</code>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
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
          <p key={key} className="text-[14px] leading-[1.75]">
            {renderNodes(node.content, key)}
          </p>,
        );
        break;

      case "heading": {
        const level = Math.min(3, Math.max(1, node.attrs?.level ?? 2));
        const Tag = `h${level + 1}` as "h2" | "h3" | "h4";
        out.push(
          <Tag key={key} className={HEADING_CLASS[level]}>
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
