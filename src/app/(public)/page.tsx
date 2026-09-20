import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/features/catalog/components/course-card";
import { listCourses } from "@/features/catalog/queries";
import { catalogParamsSchema } from "@/features/catalog/schemas";

export const metadata: Metadata = {
  title: "หน้าแรก",
  description:
    "ระบบจัดการเรียนรู้ออนไลน์ของมหาวิทยาลัยเกริก — เรียนได้ทุกที่ทุกเวลา พร้อมระบบป้องกันเนื้อหา",
  openGraph: {
    title: "KRIRK LMS · ระบบจัดการเรียนรู้ออนไลน์",
    description: "เรียนได้ทุกที่ทุกเวลา พร้อมระบบป้องกันเนื้อหา",
    type: "website",
  },
};

const HIGHLIGHTS = [
  {
    icon: BookOpen,
    title: "เนื้อหาหลากหลายรูปแบบ",
    body: "วิดีโอ เอกสาร บทความ และคลาสสด รวมอยู่ในคอร์สเดียว พร้อมติดตามความคืบหน้ารายบทเรียน",
  },
  {
    icon: ShieldCheck,
    title: "ป้องกันเนื้อหาของผู้สอน",
    body: "ไฟล์ทุกชิ้นเข้าถึงผ่านลิงก์อายุสั้นหลังตรวจสิทธิ์ พร้อมลายน้ำระบุตัวผู้เรียนบนเนื้อหา",
  },
  {
    icon: Smartphone,
    title: "ใช้งานได้ทุกหน้าจอ",
    body: "ออกแบบให้อ่านง่ายทั้งบนมือถือและคอมพิวเตอร์ เรียนต่อจากจุดเดิมได้ทุกอุปกรณ์",
  },
];

/** หน้าแรกสาธารณะ (§4.3 กลุ่ม public) */
export default async function HomePage() {
  const latest = await listCourses(catalogParamsSchema.parse({ sort: "newest" }));
  const featured = latest.rows.slice(0, 4);

  return (
    <>
      <section className="border-line border-b">
        <div className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-[640px]">
            <p className="text-ring mb-3 text-[13px] font-semibold">มหาวิทยาลัยเกริก</p>
            <h1 className="text-[32px] leading-[1.2] font-bold tracking-[-0.02em] sm:text-[40px]">
              ระบบจัดการเรียนรู้ออนไลน์ สำหรับนักศึกษาและบุคลากร
            </h1>
            <p className="text-fg-2 mt-4 text-[15px] leading-relaxed">
              รวมคอร์สจากทุกคณะไว้ที่เดียว เรียนได้ทุกที่ทุกเวลา ติดตามความคืบหน้าของตัวเองได้ตลอด
              และผู้สอนมั่นใจได้ว่าเนื้อหาถูกป้องกันอย่างเหมาะสม
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/courses">
                  ดูคลังคอร์ส <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/register">สมัครสมาชิก</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-line border-b">
        <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-12 sm:px-6 md:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card border-border rounded-xl border p-5">
              <span className="bg-accent text-accent-foreground mb-3.5 flex size-10 items-center justify-center rounded-xl">
                <Icon className="size-5" />
              </span>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.018em]">คอร์สล่าสุด</h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              คอร์สที่เพิ่งเปิดให้เรียนในระบบ
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/courses">
              ดูทั้งหมด <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {featured.length === 0 ? (
          <p className="bg-card border-border text-muted-foreground rounded-xl border px-4 py-10 text-center text-[13px]">
            ยังไม่มีคอร์สที่เปิดให้บุคคลทั่วไปเห็น — เข้าสู่ระบบเพื่อดูคอร์สภายในของสถาบัน
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
