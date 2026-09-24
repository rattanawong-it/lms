import type { Metadata } from "next";
import { saveNotifyPrefs } from "@/features/notifications/actions";
import { NotifyPrefsForm } from "@/features/notifications/components/notify-prefs-form";
import { getMyNotifyPrefs } from "@/features/notifications/queries";

export const metadata: Metadata = { title: "การแจ้งเตือน" };

/** M11 · FR-11.3/11.4 — เลือกช่องทางรับการแจ้งเตือนแต่ละชนิด */
export default async function NotificationSettingsPage() {
  const { prefs, email, channels } = await getMyNotifyPrefs();
  return (
    <section>
      <NotifyPrefsForm
        prefs={prefs}
        email={email}
        editable={channels.editable}
        line={channels.line}
        save={saveNotifyPrefs}
      />
    </section>
  );
}
