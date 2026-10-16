import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { mediaSrc, parseRichTextDoc } from "@/lib/rich-text-doc";
import { RichText } from "@/components/shared/rich-text";
import { countWords, prettyHtml } from "@/components/editor/lib";

/**
 * FR-05.10 — เครื่องมือ editor ขั้นสูง (system-design §8.4)
 * ทุกความสามารถต้องผ่านทั้งตัวตรวจฝั่ง server และตัว render — ค่านอกชุดที่กำหนดต้องหาย
 */
const doc = (...content: unknown[]) => ({ type: "doc", content });
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (value: string, attrs?: Record<string, unknown>) => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [text(value)],
});

describe("parseRichTextDoc — การจัดตำแหน่ง", () => {
  it("เก็บ center/right/justify · ชิดซ้ายเป็นค่าตั้งต้นไม่ต้องเก็บ", () => {
    const parsed = parseRichTextDoc(
      doc(para("ก", { textAlign: "center" }), para("ข", { textAlign: "left" }), {
        type: "heading",
        attrs: { level: 1, textAlign: "right" },
        content: [text("หัวข้อ")],
      }),
    );
    expect(parsed?.content[0]).toEqual(para("ก", { textAlign: "center" }));
    expect(parsed?.content[1]).toEqual(para("ข"));
    expect(parsed?.content[2].attrs).toEqual({ level: 1, textAlign: "right" });
  });

  it("ค่าที่ไม่รู้จักหรือ CSS แทรกมาถูกทิ้ง", () => {
    const parsed = parseRichTextDoc(doc(para("ก", { textAlign: "center; background:url(x)" })));
    expect(parsed?.content[0]).toEqual(para("ก"));
  });
});

describe("parseRichTextDoc — mark ใหม่", () => {
  it("สีตัวอักษร/ไฮไลต์รับเฉพาะชื่อในชุด", () => {
    const parsed = parseRichTextDoc(
      doc({
        type: "paragraph",
        content: [
          text("แดง", [{ type: "textColor", attrs: { color: "red" } }]),
          text("hex", [{ type: "textColor", attrs: { color: "#ff0000" } }]),
          text("เหลือง", [{ type: "highlight", attrs: { color: "yellow" } }]),
          text("แปลก", [{ type: "highlight", attrs: { color: "url(javascript:x)" } }]),
        ],
      }),
    );
    const content = parsed?.content[0].content ?? [];
    expect(content[0].marks).toEqual([{ type: "textColor", attrs: { color: "red" } }]);
    expect(content[1].marks).toBeUndefined();
    expect(content[2].marks).toEqual([{ type: "highlight", attrs: { color: "yellow" } }]);
    expect(content[3].marks).toBeUndefined();
  });

  it("ตัวยก/ตัวห้อย", () => {
    const parsed = parseRichTextDoc(
      doc({ type: "paragraph", content: [text("2", [{ type: "superscript" }]), text("2", [{ type: "subscript" }])] }),
    );
    expect(parsed?.content[0].content?.map((n) => n.marks?.[0].type)).toEqual(["superscript", "subscript"]);
  });
});

describe("parseRichTextDoc — block ใหม่", () => {
  it("เช็คลิสต์เก็บ checked เป็น boolean เท่านั้น", () => {
    const parsed = parseRichTextDoc(
      doc({
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [para("ทำแล้ว")] },
          { type: "taskItem", attrs: { checked: "true" }, content: [para("ยัง")] },
        ],
      }),
    );
    expect(parsed?.content[0].content?.map((n) => n.attrs?.checked)).toEqual([true, false]);
  });

  it("กล่องเน้นรับเฉพาะโทนที่กำหนด ไม่งั้นเป็น info", () => {
    const parsed = parseRichTextDoc(
      doc(
        { type: "callout", attrs: { tone: "warning" }, content: [para("ระวัง")] },
        { type: "callout", attrs: { tone: "evil" }, content: [para("x")] },
      ),
    );
    expect(parsed?.content.map((n) => n.attrs?.tone)).toEqual(["warning", "info"]);
  });

  it("กล่องพับคงโครง summary + content ไว้ แม้หัวข้อว่าง", () => {
    const parsed = parseRichTextDoc(
      doc({
        type: "details",
        content: [
          { type: "detailsSummary" },
          { type: "detailsContent", content: [para("เฉลย")] },
        ],
      }),
    );
    expect(parsed?.content[0].content?.map((n) => n.type)).toEqual(["detailsSummary", "detailsContent"]);
  });

  it("รูปเก็บขนาด/ตำแหน่งจากชุดที่กำหนด · พิกเซลอิสระถูกทิ้ง", () => {
    const src = mediaSrc("clh0000000000000000000000");
    const parsed = parseRichTextDoc(
      doc(
        { type: "image", attrs: { src, alt: "a", width: "md", align: "center" } },
        { type: "image", attrs: { src, alt: "b", width: 9999, align: "middle" } },
      ),
    );
    expect(parsed?.content[0].attrs).toEqual({ src, alt: "a", width: "md", align: "center" });
    expect(parsed?.content[1].attrs).toEqual({ src, alt: "b" });
  });
});

describe("RichText — render ความสามารถใหม่", () => {
  it("จัดกึ่งกลางด้วย class ไม่ใช่ style", () => {
    render(<RichText content={doc(para("กลาง", { textAlign: "center" }))} />);
    const p = screen.getByText("กลาง");
    expect(p).toHaveClass("text-center");
    expect(p.getAttribute("style")).toBeNull();
  });

  it("สีที่ไม่อยู่ในชุดไม่ใส่ class/style ใด ๆ", () => {
    render(
      <RichText
        content={doc({
          type: "paragraph",
          content: [
            text("แดง", [{ type: "textColor", attrs: { color: "red" } }]),
            text("ปลอม", [{ type: "textColor", attrs: { color: "#f00" } }]),
          ],
        })}
      />,
    );
    expect(screen.getByText("แดง")).toHaveClass("text-red-700");
    expect(screen.getByText("ปลอม").tagName).toBe("P");
  });

  it("ตัวยก/ไฮไลต์/เช็คลิสต์/กล่องเน้น/กล่องพับ", () => {
    render(
      <RichText
        content={doc(
          { type: "paragraph", content: [text("x"), text("2", [{ type: "superscript" }])] },
          { type: "paragraph", content: [text("สำคัญ", [{ type: "highlight", attrs: { color: "yellow" } }])] },
          { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para("อ่านบทที่ 1")] }] },
          { type: "callout", attrs: { tone: "warning" }, content: [para("ส่งงานก่อนวันศุกร์")] },
          {
            type: "details",
            content: [
              { type: "detailsSummary", content: [text("ดูเฉลย")] },
              { type: "detailsContent", content: [para("คำตอบคือ 42")] },
            ],
          },
        )}
      />,
    );
    expect(screen.getByText("2").tagName).toBe("SUP");
    expect(screen.getByText("สำคัญ").tagName).toBe("MARK");
    expect(screen.getByRole("checkbox", { name: "ทำแล้ว" })).toBeChecked();
    expect(screen.getByRole("note", { name: "คำเตือน" })).toHaveTextContent("ส่งงานก่อนวันศุกร์");
    const summary = screen.getByText("ดูเฉลย");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });
});

describe("editor lib", () => {
  it("นับคำไทยด้วยการตัดคำ ไม่ใช่ช่องว่าง", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("hello world")).toBe(2);
    expect(countWords("ผู้เรียนส่งงาน")).toBeGreaterThan(1);
  });

  it("prettyHtml ขึ้นบรรทัดหลังปิด block", () => {
    expect(prettyHtml("<p>ก</p><p>ข</p>")).toBe("<p>ก</p>\n<p>ข</p>");
  });
});
