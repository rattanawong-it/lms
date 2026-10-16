/**
 * ฟังก์ชันล้วนของ editor (FR-05.10) — แยกจาก component เพื่อให้ทดสอบด้วย Vitest ได้
 */

/** นับคำแบบตัดคำไทย — ภาษาไทยไม่มีช่องว่างระหว่างคำ การนับตามช่องว่างจึงได้ตัวเลขต่ำเกินจริง */
export function countWords(text: string): number {
  if (!text.trim()) return 0;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    let count = 0;
    for (const part of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) {
      if (part.isWordLike) count += 1;
    }
    return count;
  }
  return text.trim().split(/\s+/).length;
}

const BLOCK_END = /(<\/(?:p|h[1-6]|li|ul|ol|blockquote|pre|table|thead|tbody|tr|div|details|summary)>|<hr>|<br>)/g;

/** ขึ้นบรรทัดใหม่หลังปิด block — `getHTML()` คืนทั้งเอกสารเป็นบรรทัดเดียวซึ่งแก้ยาก */
export function prettyHtml(html: string): string {
  return html.replace(BLOCK_END, "$1\n").trim();
}
