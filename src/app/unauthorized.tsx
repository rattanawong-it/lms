import type { Metadata } from "next";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "กรุณาเข้าสู่ระบบ" };

/** หน้า 401 ของทั้งระบบ — แสดงเมื่อเรียก unauthorized() (ไม่มีไฟล์นี้ Next จะใช้หน้าภาษาอังกฤษ) */
export default function Unauthorized() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-[420px] text-center">
        <span className="bg-muted text-muted-foreground mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl">
          <LogIn className="size-7" />
        </span>
        <h1 className="text-[24px] font-bold tracking-[-0.018em]">กรุณาเข้าสู่ระบบ</h1>
        <p className="text-muted-foreground mt-2 text-[13.5px] leading-relaxed">
          ต้องเข้าสู่ระบบก่อนจึงจะใช้งานส่วนนี้ได้
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/login">เข้าสู่ระบบ</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
