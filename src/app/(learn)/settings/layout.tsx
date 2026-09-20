import { PageHeader } from "@/components/shared/page-header";
import { SettingsTabs } from "@/features/account/components/settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <PageHeader
        title="ตั้งค่าบัญชี"
        description="M01 · จัดการข้อมูลส่วนตัวและความปลอดภัยของบัญชี"
      />
      <SettingsTabs />
      {children}
    </>
  );
}
