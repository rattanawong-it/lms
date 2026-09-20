import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CourseCard } from "@/features/catalog/components/course-card";
import { catalogFilterOptions, listCourses } from "@/features/catalog/queries";
import { parseCatalogParams, type CatalogParams } from "@/features/catalog/schemas";

/** FR-03.5 — SEO ของหน้าคลังคอร์ส */
export const metadata: Metadata = {
  title: "คลังคอร์ส",
  description:
    "ค้นหาคอร์สเรียนออนไลน์ของมหาวิทยาลัยเกริก กรองตามหมวดหมู่ คณะ และระดับความยาก",
  openGraph: {
    title: "คลังคอร์ส · KRIRK LMS",
    description: "ค้นหาคอร์สเรียนออนไลน์ของมหาวิทยาลัยเกริก",
    type: "website",
  },
};

type RawParams = Record<string, string | string[] | undefined>;

/** สร้างลิงก์ของหน้าถัดไป/ก่อนหน้าโดยคงตัวกรองเดิมไว้ */
function pageHref(current: RawParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && key !== "page") params.set(key, first);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/courses?${qs}` : "/courses";
}

function CatalogSkeleton() {
  return (
    <div>
      <Skeleton className="mb-5 h-[124px] w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * ส่วนที่ต้องรอข้อมูล — แยกออกมาไว้ใน Suspense ของหน้านี้โดยเฉพาะ
 *
 * เดิมใช้ `loading.tsx` ที่ระดับ segment แต่ boundary นั้นครอบ `/courses/[slug]` ด้วย
 * ทำให้ `notFound()` ของหน้ารายละเอียดตอบ HTTP 200 (soft 404) เพราะ response
 * เริ่ม stream ไปก่อนแล้ว จึงย้ายมาไว้ในหน้านี้ที่เดียว
 */
async function CatalogResults({ params, raw }: { params: CatalogParams; raw: RawParams }) {
  const [result, options] = await Promise.all([listCourses(params), catalogFilterOptions()]);

  return (
    <>
      <p className="text-muted-foreground -mt-4 mb-5 text-[13px]">
        พบ <span className="num font-medium">{result.total.toLocaleString("th-TH")}</span> คอร์ส
        {params.q ? ` สำหรับคำค้น "${params.q}"` : ""}
      </p>

      <CatalogFilters options={options} />

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="ไม่พบคอร์สตามเงื่อนไขที่เลือก"
          description="ลองใช้คำค้นที่สั้นลง หรือล้างตัวกรองเพื่อดูคอร์สทั้งหมดที่เปิดให้เรียน"
          action={
            <Button asChild>
              <Link href="/courses">ดูคอร์สทั้งหมด</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.rows.map((course) => (
            <li key={course.id}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 ? (
        <nav
          aria-label="แบ่งหน้าคลังคอร์ส"
          className="mt-6 flex items-center justify-between gap-3"
        >
          <p className="text-muted-foreground text-[12.5px]">
            หน้า <span className="num">{result.page}</span> จาก{" "}
            <span className="num">{result.pageCount}</span>
          </p>
          <div className="flex gap-2">
            <Button
              asChild={result.page > 1}
              variant="outline"
              size="sm"
              disabled={result.page <= 1}
            >
              {result.page > 1 ? (
                <Link href={pageHref(raw, result.page - 1)}>ก่อนหน้า</Link>
              ) : (
                <span>ก่อนหน้า</span>
              )}
            </Button>
            <Button
              asChild={result.page < result.pageCount}
              variant="outline"
              size="sm"
              disabled={result.page >= result.pageCount}
            >
              {result.page < result.pageCount ? (
                <Link href={pageHref(raw, result.page + 1)}>ถัดไป</Link>
              ) : (
                <span>ถัดไป</span>
              )}
            </Button>
          </div>
        </nav>
      ) : null}
    </>
  );
}

/** M03 · FR-03.2 — คลังคอร์ส */
export default async function CoursesPage(props: PageProps<"/courses">) {
  const raw = await props.searchParams;
  const params = parseCatalogParams(raw);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      <h1 className="mb-5 text-[26px] font-bold tracking-[-0.018em]">คลังคอร์ส</h1>

      {/* key ทำให้เปลี่ยนตัวกรองแล้วเห็น skeleton ใหม่ แทนที่จะค้างผลเดิมไว้ */}
      <Suspense key={JSON.stringify(params)} fallback={<CatalogSkeleton />}>
        <CatalogResults params={params} raw={raw} />
      </Suspense>
    </div>
  );
}
