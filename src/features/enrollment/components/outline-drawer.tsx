"use client";

import * as React from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * M05 · FR-05.6 — สารบัญบทเรียนบนจอมือถือ
 *
 * จอ lg ขึ้นไปใช้สารบัญที่ตรึงอยู่ข้างเนื้อหา ส่วนจอเล็กเก็บไว้ใน drawer
 * หน้าเรียนจึงส่ง `<LessonOutline>` ตัวเดียวกันมาให้ทั้งสองที่ แต่ตัวที่ซ่อนด้วย
 * `hidden` ไม่อยู่ใน accessibility tree จึงไม่กลายเป็นสารบัญซ้อนสองอัน
 */
export function OutlineDrawer({
  completedLessons,
  totalLessons,
  children,
}: {
  completedLessons: number;
  totalLessons: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  /**
   * กดลิงก์บทเรียนในสารบัญแล้วต้องปิด drawer เอง ไม่งั้นมันค้างทับบทเรียนใหม่
   * ดักที่ระดับกล่องเพราะลิงก์อยู่ใน `children` ซึ่งเป็น server component ที่ส่งมาจากหน้า
   */
  function closeOnLessonLink(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <ListTree className="size-4" />
        สารบัญบทเรียน
        <span className="text-muted-foreground num ml-1 text-[12px]">
          ({completedLessons}/{totalLessons})
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[88%] max-w-[360px] overflow-y-auto p-4">
          <SheetHeader className="p-0">
            <SheetTitle>สารบัญบทเรียน</SheetTitle>
            <SheetDescription>
              เลือกบทเรียนที่ต้องการ บทที่ยังไม่ปลดล็อกจะกดไม่ได้
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4" onClickCapture={closeOnLessonLink}>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
