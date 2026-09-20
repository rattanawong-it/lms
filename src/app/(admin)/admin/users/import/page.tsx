import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { UserImport } from "@/features/users/components/user-import";
import { requireAtLeast } from "@/lib/rbac";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "นำเข้าผู้ใช้จาก CSV" };

/** M02 · FR-02.5 — นำเข้าผู้ใช้แบบกลุ่ม */
export default async function UserImportPage() {
  await requireAtLeast(Role.DEPT_ADMIN);

  return (
    <>
      <PageHeader
        title="นำเข้าผู้ใช้จาก CSV"
        description="FR-02.5 · อัปโหลดรายชื่อครั้งละหลายคน ระบบตรวจทุกแถวก่อนนำเข้า และผู้ใช้จะตั้งรหัสผ่านเองผ่านเมนูลืมรหัสผ่าน"
      />
      <UserImport />
    </>
  );
}
