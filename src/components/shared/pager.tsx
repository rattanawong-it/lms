import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** เลื่อนหน้ารายการแบบลิงก์ — คงตัวกรองเดิมไว้ใน URL (ถาม-ตอบ · รีวิว · รายงาน) */
export function Pager({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <nav aria-label="เลือกหน้า" className="mt-4 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>
            <ChevronLeft className="size-4" /> ก่อนหน้า
          </Link>
        </Button>
      ) : null}
      <span className="text-muted-foreground text-[12.5px]">
        หน้า {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>
            ถัดไป <ChevronRight className="size-4" />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
