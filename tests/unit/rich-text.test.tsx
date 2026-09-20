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
