import { LogoMark } from "@/components/brand/logo-mark";

/**
 * โครงหน้าบัญชีผู้ใช้ — อ้างอิง project-ui/KRIRK LMS Auth.dc.html
 * เดสก์ท็อป: แผงแบรนด์เข้ม 440px ซ้าย + ฟอร์มขวา · มือถือ: แถบแบรนด์บาง + ฟอร์มเต็มจอ
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* แผงแบรนด์ — ซ่อนรายละเอียดบนจอเล็กเพื่อให้ฟอร์มอยู่เหนือ fold */}
      <aside className="relative shrink-0 overflow-hidden bg-[#1b1c1e] px-6 py-6 text-[#e8eaed] lg:w-[440px] lg:px-10 lg:py-11">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center gap-3">
            <span className="bg-primary flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-white">
              <LogoMark />
            </span>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.01em]">มหาวิทยาลัยเกริก</div>
              <div className="text-[11.5px] text-[#9aa0a6]">ระบบจัดการเรียนรู้ออนไลน์</div>
            </div>
          </div>

          <div className="mt-14 hidden flex-1 lg:block">
            <h2 className="mb-[18px] text-[34px] leading-[1.35] font-bold tracking-[-0.02em]">
              เรียนรู้ได้ทุกที่
              <br />
              ในระบบเดียวของเกริก
            </h2>
            <p className="max-w-[320px] text-[14px] leading-[1.85] text-[#bdc1c6]">
              รวมรายวิชาของทุกคณะและคอร์สสาธารณะไว้ที่เดียว พร้อมระบบติดตามความคืบหน้า
              แบบทดสอบ และใบประกาศนียบัตรที่ตรวจสอบได้
            </p>
          </div>

          <dl className="mt-7 hidden gap-3.5 border-t border-white/15 pt-6 lg:grid">
            {[
              ["4 บทบาทผู้ใช้", "ผู้ดูแลระบบ · คณะ · ผู้สอน · ผู้เรียน"],
              ["ปลอดภัยตาม PDPA", "บันทึก Audit Log ทุกการเข้าสู่ระบบ"],
              ["ใช้ได้ทุกอุปกรณ์", "ออกแบบ mobile-first รองรับจอ 375px ขึ้นไป"],
            ].map(([title, desc]) => (
              <div key={title}>
                <dt className="text-[13px] font-semibold">{title}</dt>
                <dd className="text-[11.5px] text-[#9aa0a6]">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <main className="bg-background flex flex-1 items-start justify-center px-4 py-8 sm:px-8 lg:py-11">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
