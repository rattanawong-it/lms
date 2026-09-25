import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireAtLeast, ROLE_LABEL } from "@/lib/rbac";
import { formatDateTime } from "@/lib/dates";
import { Role } from "@/generated/prisma/enums";
import { DeletionDecision } from "@/features/privacy/components/deletion-decision";
import { listDeletionRequests } from "@/features/privacy/queries";

export const metadata: Metadata = { title: "คำขอลบบัญชี" };

/** M17 · FR-17.4 — SUPER_ADMIN อนุมัติ/ปฏิเสธคำขอลบบัญชีตาม PDPA (Q9) */
export default async function DeletionRequestsPage() {
  const admin = await requireAtLeast(Role.SUPER_ADMIN);
  const requests = await listDeletionRequests();

  return (
    <>
      <PageHeader
        title="คำขอลบบัญชี"
        description="อนุมัติแล้วระบบจะลบข้อมูลที่ระบุตัวตน (anonymize) โดยเก็บผลการเรียนไว้แบบไม่ระบุตัวตน · แจ้งผลผู้ใช้ทางอีเมลทั้งสองกรณี"
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={<UserX className="size-6" />}
          title="ไม่มีคำขอที่รอพิจารณา"
          description="เมื่อผู้ใช้ส่งคำขอลบบัญชีจากหน้าตั้งค่าความเป็นส่วนตัว รายการจะขึ้นที่นี่"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {requests.map((r) => (
            <li
              key={r.id}
              data-deletion-request={r.email}
              className="bg-card border-border grid min-w-0 grid-cols-1 gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]"
            >
              <div className="min-w-0 text-[13px]">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  <Badge variant="secondary">{ROLE_LABEL[r.role]}</Badge>
                </p>
                <p className="text-muted-foreground num truncate text-[12px]">{r.email}</p>
                <p className="text-muted-foreground mt-1 text-[12px]">
                  ขอเมื่อ <span className="num">{formatDateTime(r.requestedAt)}</span>
                  {r.department ? ` · ${r.department}` : ""} · ลงทะเบียน {r.enrollments} คอร์ส · ใบประกาศ {r.certificates} ใบ
                </p>
                <p className="mt-2 break-words">
                  <span className="text-muted-foreground">เหตุผล: </span>
                  {r.reason ?? "—"}
                </p>
              </div>
              <DeletionDecision userId={r.id} name={r.name} self={r.id === admin.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
