import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { UserFilters } from "@/features/users/components/user-filters";
import { UserTable } from "@/features/users/components/user-table";
import { listUsers } from "@/features/users/queries";
import { userFilterSchema } from "@/features/users/schemas";
import { departmentOptions } from "@/features/departments/queries";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "รายชื่อผู้ใช้" };

/** M02 · FR-02.2 / FR-02.3 / FR-02.4 */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const params = await searchParams;
  const filter = userFilterSchema.parse({
    q: params.q,
    role: params.role,
    departmentId: params.departmentId,
    status: params.status ?? "all",
    page: params.page ?? 1,
  });

  const [{ rows, total, page, pageCount, actor }, departments] = await Promise.all([
    listUsers(filter),
    departmentOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="รายชื่อผู้ใช้"
        description="FR-02.2 ค้นหาและกรองผู้ใช้ · FR-02.3 กำหนดบทบาทและคณะ · FR-02.4 ระงับ/เปิดใช้งานบัญชี"
      />

      <Suspense fallback={<Skeleton className="mb-4 h-[132px] w-full rounded-xl" />}>
        <UserFilters
          departments={departments}
          canFilterDepartment={actor.role === Role.SUPER_ADMIN}
        />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
        <UserTable
          rows={rows}
          actor={actor}
          departments={departments}
          page={page}
          pageCount={pageCount}
          total={total}
        />
      </Suspense>
    </>
  );
}
