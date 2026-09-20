import type { Metadata } from "next";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { ProfileForm } from "@/features/account/components/profile-form";
import { getMyProfile } from "@/features/account/queries";
import { ROLE_LABEL } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "โปรไฟล์ของฉัน" };

/** M01 · FR-01.5 */
export default async function ProfilePage() {
  const profile = await getMyProfile();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <section className="bg-card border-border rounded-xl border p-5">
        <h2 className="mb-4 text-[15px] font-semibold">ข้อมูลส่วนตัว</h2>
        <ProfileForm
          defaults={{
            name: profile.name,
            phone: profile.phone,
            externalId: profile.externalId,
          }}
        />
      </section>

      <aside className="bg-card border-border h-fit rounded-xl border p-5">
        <h2 className="mb-4 text-[15px] font-semibold">สถานะบัญชี</h2>
        <dl className="space-y-3.5 text-[12.5px]">
          <div>
            <dt className="text-muted-foreground">อีเมล</dt>
            <dd className="num mt-0.5 break-all">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">บทบาท</dt>
            <dd className="mt-0.5 font-medium">{ROLE_LABEL[profile.role]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">คณะ / หน่วยงาน</dt>
            <dd className="mt-0.5">
              {profile.department ? `${profile.department.code} · ${profile.department.name}` : "ไม่สังกัดคณะ"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">การยืนยันอีเมล</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
              {profile.emailVerified ? (
                <>
                  <BadgeCheck className="text-success-fg size-4" /> ยืนยันแล้ว
                </>
              ) : (
                <span className="text-warning-fg">ยังไม่ยืนยัน</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ความยินยอม PDPA</dt>
            <dd className="mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="text-success-fg size-4" />
              {profile.pdpaConsentAt ? formatDate(profile.pdpaConsentAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">สมัครเมื่อ</dt>
            <dd className="mt-0.5">{formatDate(profile.createdAt)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
