import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichText, richTextToPlain } from "@/components/shared/rich-text";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const para = (text: string, marks?: unknown[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

describe("RichText (NFR §9 — render ตาม allowlist)", () => {
  it("แสดงย่อหน้าและหัวข้อ", () => {
    render(
      <RichText
        content={doc(
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "หัวข้อ" }] },
          para("เนื้อหาย่อหน้า"),
        )}
      />,
    );
    expect(screen.getByRole("heading", { name: "หัวข้อ" })).toBeInTheDocument();
    expect(screen.getByText("เนื้อหาย่อหน้า")).toBeInTheDocument();
  });

  it("แสดงรายการหัวข้อย่อย", () => {
    render(
      <RichText
        content={doc({
          type: "bulletList",
          content: [
            { type: "listItem", content: [para("ข้อหนึ่ง")] },
            { type: "listItem", content: [para("ข้อสอง")] },
          ],
        })}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("ลิงก์ http/https และ path ภายในระบบใช้งานได้", () => {
    render(
      <RichText
        content={doc(
          para("เว็บนอก", [{ type: "link", attrs: { href: "https://krirk.ac.th" } }]),
          para("ในระบบ", [{ type: "link", attrs: { href: "/courses" } }]),
        )}
      />,
    );
    expect(screen.getByRole("link", { name: "เว็บนอก" })).toHaveAttribute(
      "href",
      "https://krirk.ac.th/",
    );
    expect(screen.getByRole("link", { name: "ในระบบ" })).toHaveAttribute("href", "/courses");
  });

  it("ไม่สร้างลิงก์จาก javascript: และ data: — ข้อความยังอยู่แต่กดไม่ได้", () => {
    render(
      <RichText
        content={doc(
          para("อันตราย", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
          para("ฝังข้อมูล", [{ type: "link", attrs: { href: "data:text/html,<script>" } }]),
          para("ข้ามโดเมน", [{ type: "link", attrs: { href: "//evil.example" } }]),
        )}
      />,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("อันตราย")).toBeInTheDocument();
    expect(screen.getByText("ฝังข้อมูล")).toBeInTheDocument();
  });

  it("แสดงรูปที่ชี้มาที่ /api/media และข้ามรูปที่ชี้ออกนอกระบบ (FR-05.4)", () => {
    render(
      <RichText
        content={doc(
          { type: "image", attrs: { src: "/api/media/clh0000000000000000000000", alt: "แผนผัง" } },
          { type: "image", attrs: { src: "https://evil.example/pixel.png", alt: "แอบติดตาม" } },
        )}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/api/media/clh0000000000000000000000");
    expect(screen.queryByAltText("แอบติดตาม")).not.toBeInTheDocument();
  });

  it("ฝัง iframe ได้เฉพาะโดเมนที่อนุญาต (FR-05.4)", () => {
    const { container } = render(
      <RichText
        content={doc(
          { type: "youtube", attrs: { src: "https://www.youtube-nocookie.com/embed/abc" } },
          { type: "youtube", attrs: { src: "https://evil.example/embed/abc" } },
        )}
      />,
    );
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc");
  });

  it("แสดงตารางพร้อมหัวตาราง (FR-05.4)", () => {
    render(
      <RichText
        content={doc({
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [para("สัปดาห์")] },
                { type: "tableHeader", content: [para("หัวข้อ")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [para("1")] },
                { type: "tableCell", content: [para("แนะนำรายวิชา")] },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "แนะนำรายวิชา" })).toBeInTheDocument();
  });

  it("node ที่ไม่รู้จักไม่ทำให้เนื้อหาข้างในหาย", () => {
    render(
      <RichText content={doc({ type: "iframeEmbed", content: [para("ข้อความข้างใน")] })} />,
    );
    expect(screen.getByText("ข้อความข้างใน")).toBeInTheDocument();
  });

  it("เนื้อหาว่างหรือรูปแบบผิดคืน null โดยไม่ throw", () => {
    const { container } = render(<RichText content={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(() => render(<RichText content={"ไม่ใช่ JSON ของ Tiptap"} />)).not.toThrow();
  });
});

describe("richTextToPlain", () => {
  it("รวมข้อความทุกชั้นเป็นบรรทัดเดียว", () => {
    expect(richTextToPlain(doc(para("สวัสดี"), para("ชาวโลก")))).toBe("สวัสดี ชาวโลก");
  });

  it("ตัดความยาวตามที่กำหนดพร้อมจุดไข่ปลา", () => {
    const long = richTextToPlain(doc(para("ก".repeat(300))), 50);
    expect(long).toHaveLength(50);
    expect(long.endsWith("…")).toBe(true);
  });

  it("คืนสตริงว่างเมื่อไม่มีเนื้อหา", () => {
    expect(richTextToPlain(null)).toBe("");
    expect(richTextToPlain(undefined)).toBe("");
  });
});
