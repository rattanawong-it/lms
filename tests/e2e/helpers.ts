/**
 * ตัวช่วยร่วมของชุด e2e — ไฟล์นี้ต้องไม่ประกาศ test ใด ๆ
 */

/**
 * หน้าห้องผู้สอนที่กรองด้วยชื่อคอร์สแล้ว
 * DB ทดสอบสะสมคอร์สเพิ่มทุกครั้งที่รันเทสต์ — ถ้าเปิด /teach เฉย ๆ รายการยาวขึ้นเรื่อย ๆ จนโหลดช้าและหาลิงก์ไม่ทัน
 */
export function teachSearch(title: string): string {
  return `/teach?q=${encodeURIComponent(title)}`;
}

// พอร์ตเว็บ/API ของ Mailpit ตาม docker-compose.yml (8026 — 8025 บนเครื่องพัฒนาเป็นของ container อื่น)
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8026";

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[] };

/**
 * อีเมลที่ Mailpit รับไว้ถึงผู้รับนี้และหัวเรื่องตรงกัน (FR-11.3)
 * ใช้กับ `expect.poll` — อีเมลส่งหลัง response ด้วย `after()` จึงมาช้ากว่าหน้าจอเล็กน้อย
 */
export async function findMail(to: string, subject: string): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=500`);
  if (!res.ok) throw new Error(`อ่าน Mailpit ไม่ได้ (${res.status}) — รัน pnpm db:up แล้วหรือยัง`);
  const { messages } = (await res.json()) as { messages: MailpitMessage[] };
  return messages.filter((m) => m.Subject === subject && m.To.some((t) => t.Address === to));
}
