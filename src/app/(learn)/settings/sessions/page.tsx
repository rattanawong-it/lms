import type { Metadata } from "next";
import { SessionList } from "@/features/account/components/session-list";
import { describeDevice, listMySessions } from "@/features/account/queries";

export const metadata: Metadata = { title: "อุปกรณ์ที่เข้าสู่ระบบ" };

/** M01 · FR-01.6 */
export default async function SessionsPage() {
  const sessions = await listMySessions();
  const describe = Object.fromEntries(
    sessions.map((s) => [s.token, describeDevice(s.userAgent)]),
  );

  return (
    <section>
      <p className="text-muted-foreground mb-4 text-[13px] leading-relaxed">
        FR-01.6 · หากพบอุปกรณ์ที่ไม่ใช่ของคุณ ให้กดยกเลิกทันที
        แล้วเปลี่ยนรหัสผ่านผ่านเมนูลืมรหัสผ่าน
      </p>
      <SessionList sessions={sessions} describe={describe} />
    </section>
  );
}
