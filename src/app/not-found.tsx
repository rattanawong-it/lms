import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "ไม่พบหน้าที่ต้องการ" };

/** หน้า 404 ของทั้งระบบ (system-design §11) */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-[420px] text-center">
        <span className="bg-muted text-muted-foreground mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl">
          <Compass className="size-7" />
        </span>
        <h1 className="text-[24px] font-bold tracking-[-0.018em]">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-muted-foreground mt-2 text-[13.5px] leading-relaxed">
          หน้านี้อาจถูกย้าย ถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง
          ลองกลับไปที่คลังคอร์สเพื่อค้นหาสิ่งที่ต้องการอีกครั้ง
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/courses">ไปที่คลังคอร์ส</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
