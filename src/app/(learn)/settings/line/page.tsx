import type { Metadata } from "next";
import QRCode from "qrcode";
import { formatDateTime } from "@/lib/dates";
import { requestLineLinkCode, unlinkLine } from "@/features/line/actions";
import { LineConnect, type LineConnectView } from "@/features/line/components/line-connect";
import { getMyLineStatus } from "@/features/line/queries";

export const metadata: Metadata = { title: "LINE" };

/** M12 · FR-12.1/12.4 — เชื่อมต่อบัญชี LINE เพื่อรับการแจ้งเตือน */
export default async function LineSettingsPage() {
  const status = await getMyLineStatus();

  let view: LineConnectView;
  if (!status.enabled) view = { state: "disabled" };
  else if (status.linkedAt) view = { state: "linked", linkedAt: formatDateTime(status.linkedAt) };
  else {
    view = {
      state: "unlinked",
      code: status.code ? { value: status.code.code, expiresAt: formatDateTime(status.code.expiresAt) } : null,
      oaId: status.oaId,
      addFriendUrl: status.addFriendUrl,
      qr: status.addFriendUrl ? await QRCode.toDataURL(status.addFriendUrl, { margin: 1, width: 240 }) : null,
    };
  }

  return (
    <section>
      <LineConnect view={view} requestCode={requestLineLinkCode} unlink={unlinkLine} />
    </section>
  );
}
