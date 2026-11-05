import { describe, expect, it } from "vitest";
import { mediaSrc, parseRichTextDoc, parseRichTextField, richTextLength, richTextToLines } from "@/lib/rich-text-doc";

/**
 * FR-05.4 · NFR §9 — ด่านตรวจ Tiptap JSON ฝั่ง server
 * เทสต์ชุดนี้จำลอง "JSON ที่ client ส่งมา" ซึ่งอาจถูกแก้ระหว่างทางก่อนถึงเซิร์ฟเวอร์
 */
const ASSET_SRC = mediaSrc("clh0000000000000000000000");

function doc(...content: unknown[]) {
  return { type: "doc", content };
}

function paragraph(text: string, marks?: unknown[]) {
  return { type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] };
}

describe("parseRichTextDoc — โครงสร้างพื้นฐาน", () => {
  it("รับเฉพาะเอกสารที่ type เป็น doc", () => {
    expect(parseRichTextDoc(null)).toBeNull();
    expect(parseRichTextDoc("<p>hi</p>")).toBeNull();
    expect(parseRichTextDoc({ type: "paragraph" })).toBeNull();
  });

  it("เอกสารที่ไม่เหลือเนื้อหาถือว่าว่าง", () => {
    expect(parseRichTextDoc(doc({ type: "paragraph" }))).toBeNull();
    expect(parseRichTextDoc(doc(paragraph("   ")))).toBeNull();
  });

  it("คงย่อหน้าและข้อความที่ถูกต้องไว้", () => {
    const result = parseRichTextDoc(doc(paragraph("สวัสดี")));
    expect(result).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "สวัสดี" }] }],
    });
  });
});

describe("parseRichTextDoc — ตัด node ที่ไม่อยู่ใน allowlist", () => {
  it("ทิ้ง node แปลกปลอม แต่ยังเก็บของที่ถูกต้องไว้", () => {
    const result = parseRichTextDoc(
      doc({ type: "script", content: [{ type: "text", text: "alert(1)" }] }, paragraph("ปลอดภัย")),
    );
    expect(result?.content).toHaveLength(1);
    expect(result?.content[0]?.type).toBe("paragraph");
  });

  it("จำกัดระดับหัวข้อไว้ที่ 1–3", () => {
    const result = parseRichTextDoc(
      doc({ type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "หัวข้อ" }] }),
    );
    expect(result?.content[0]?.attrs?.level).toBe(2);
  });

  it("เก็บตารางพร้อม colspan/rowspan ที่อยู่ในช่วงที่ยอมรับ", () => {
    const result = parseRichTextDoc(
      doc({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 2, rowspan: 999 },
                content: [paragraph("หัวตาราง")],
              },
            ],
          },
        ],
      }),
    );
    const cell = result?.content[0]?.content?.[0]?.content?.[0];
    expect(cell?.type).toBe("tableHeader");
    expect(cell?.attrs).toEqual({ colspan: 2, rowspan: 1 });
  });
});

describe("parseRichTextDoc — ลิงก์และสื่อ", () => {
  it("ทิ้ง mark ลิงก์ที่เป็น javascript: แต่คงข้อความไว้", () => {
    const result = parseRichTextDoc(
      doc(paragraph("กดที่นี่", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])),
    );
    const text = result?.content[0]?.content?.[0];
    expect(text?.text).toBe("กดที่นี่");
    expect(text?.marks).toBeUndefined();
  });

  it("คงลิงก์ http/https และ path ภายในระบบไว้", () => {
    for (const href of ["https://example.com/", "/courses/intro"]) {
      const result = parseRichTextDoc(doc(paragraph("ลิงก์", [{ type: "link", attrs: { href } }])));
      expect(result?.content[0]?.content?.[0]?.marks?.[0]).toEqual({
        type: "link",
        attrs: { href },
      });
    }
  });

  it("รับรูปเฉพาะที่ชี้มาที่ /api/media เท่านั้น", () => {
    expect(parseRichTextDoc(doc({ type: "image", attrs: { src: ASSET_SRC, alt: "ปก" } }))).toEqual({
      type: "doc",
      content: [{ type: "image", attrs: { src: ASSET_SRC, alt: "ปก" } }],
    });

    for (const src of ["https://evil.example/x.png", "data:image/png;base64,AAAA", "/etc/passwd"]) {
      expect(parseRichTextDoc(doc({ type: "image", attrs: { src } }))).toBeNull();
    }
  });

  it("ฝังวิดีโอได้เฉพาะโดเมนที่อนุญาต", () => {
    const ok = parseRichTextDoc(
      doc({ type: "youtube", attrs: { src: "https://www.youtube.com/embed/abc" } }),
    );
    expect(ok?.content[0]?.attrs?.src).toBe("https://www.youtube.com/embed/abc");

    expect(
      parseRichTextDoc(doc({ type: "youtube", attrs: { src: "https://evil.example/embed" } })),
    ).toBeNull();
  });
});

describe("parseRichTextField", () => {
  it("อ่านค่าจากฟอร์มที่เป็นสตริง JSON", () => {
    expect(parseRichTextField(JSON.stringify(doc(paragraph("ok"))))?.content).toHaveLength(1);
  });

  it("ค่าว่างหรือ JSON เสียถือว่าไม่มีเนื้อหา", () => {
    expect(parseRichTextField("")).toBeNull();
    expect(parseRichTextField("{ไม่ใช่ json}")).toBeNull();
    expect(parseRichTextField(null)).toBeNull();
  });
});

describe("ชุดผู้เรียน — งานที่ส่ง (CHANGELOG #53)", () => {
  it("media: false ตัดรูปและ YouTube ทิ้ง ค่าเริ่มต้นยังรับ", () => {
    const input = doc(
      paragraph("คำตอบ"),
      { type: "image", attrs: { src: ASSET_SRC } },
      { type: "youtube", attrs: { src: "https://www.youtube-nocookie.com/embed/abc" } },
    );
    expect(parseRichTextDoc(input, { media: false })).toEqual(doc(paragraph("คำตอบ")));
    expect(parseRichTextDoc(input)?.content).toHaveLength(3);
  });

  it("นับความยาวเฉพาะข้อความ · แปลงเป็นข้อความล้วนบรรทัดละย่อหน้า", () => {
    const parsed = parseRichTextDoc(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "หัวข้อ" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph("ข้อหนึ่ง")] }] },
        paragraph("จบ"),
      ),
    )!;
    expect(richTextLength(parsed)).toBe("หัวข้อข้อหนึ่งจบ".length);
    expect(richTextToLines(parsed)).toBe("หัวข้อ\nข้อหนึ่ง\nจบ");
  });
});
