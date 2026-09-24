import { PageHeader } from "@/components/shared/page-header";
import { SettingsTabs } from "@/features/account/components/settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <PageHeader
        title="ตั้งค่าบัญชี"
        description="จัดการข้อมูลส่วนตัว ความปลอดภัยของบัญชี และการแจ้งเตือน"
      />
      <SettingsTabs />
      {children}
    </>
  );
}
