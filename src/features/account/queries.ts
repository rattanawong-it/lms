import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

/** FR-01.5 — ข้อมูลโปรไฟล์ของผู้ใช้ปัจจุบัน */
export async function getMyProfile() {
  const user = await requireUser();
  const profile = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      externalId: true,
      role: true,
      emailVerified: true,
      pdpaConsentAt: true,
      createdAt: true,
      department: { select: { code: true, name: true } },
    },
  });
  return profile;
}

export type DeviceSession = {
  token: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

/** FR-01.6 — รายการอุปกรณ์ที่ยัง login อยู่ */
export async function listMySessions(): Promise<DeviceSession[]> {
  await requireUser();
  const requestHeaders = await headers();

  const [sessions, current] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }),
    auth.api.getSession({ headers: requestHeaders }),
  ]);

  return sessions
    .map((s) => ({
      token: s.token,
      createdAt: new Date(s.createdAt),
      expiresAt: new Date(s.expiresAt),
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      current: s.token === current?.session.token,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || +b.createdAt - +a.createdAt);
}

/** แปลง user agent เป็นข้อความอ่านง่ายภาษาไทย */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "อุปกรณ์ไม่ระบุ";
  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /Android/i.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(userAgent)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "ระบบปฏิบัติการอื่น";

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /OPR\//i.test(userAgent)
      ? "Opera"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : /Firefox\//i.test(userAgent)
            ? "Firefox"
            : "เบราว์เซอร์อื่น";

  return `${browser} บน ${os}`;
}
