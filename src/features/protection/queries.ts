import "server-only";
import { db } from "@/lib/db";
import { requireAtLeast, type SessionUser } from "@/lib/rbac";
import { Role, ScreenEvent } from "@/generated/prisma/enums";
import { PROTECTION_SETTING_KEY } from "@/features/protection/schemas";

/** M15 · FR-15.8 / FR-15.9 — การตั้งค่าการป้องกัน และรายงานเหตุการณ์หน้าจอ */

/**
 * สวิตช์ระดับระบบ — ค่าตั้งต้นคือ "เปิด" เมื่อยังไม่เคยมีใครตั้งค่า
 * เพราะการป้องกันเนื้อหาเป็นจุดขายของระบบ (CLAUDE.md §1) ไม่ควรต้องไปเปิดเองทีหลัง
 */
export async function isProtectionEnabledSystemWide(): Promise<boolean> {
  const row = await db.systemSetting.findUnique({
    where: { key: PROTECTION_SETTING_KEY },
    select: { value: true },
  });
  if (!row) return true;

  const value = row.value as { enabled?: unknown } | null;
  return value?.enabled !== false;
}

export type ProtectionState = {
  /** ผลรวมที่ใช้จริง — ต้องเปิดทั้งระดับระบบและระดับคอร์ส */
  active: boolean;
  systemEnabled: boolean;
  courseEnabled: boolean;
  watermark: { name: string; id: string };
};

/**
 * FR-15.9 — การป้องกันของบทเรียนที่ผู้ใช้คนนี้กำลังดู
 * ต้องเปิดทั้งสองระดับจึงจะทำงาน — ปิดที่ใดที่หนึ่งถือว่าปิด
 */
export async function getProtectionState(
  user: SessionUser,
  courseEnabled: boolean,
): Promise<ProtectionState> {
  const systemEnabled = await isProtectionEnabledSystemWide();
  return {
    systemEnabled,
    courseEnabled,
    active: systemEnabled && courseEnabled,
    // อีเมลคือสิ่งที่ตามตัวคนได้จริงเมื่อภาพหลุดออกไป (FR-15.5)
    watermark: { name: user.name, id: user.email },
  };
}

export type ScreenEventRow = {
  id: string;
  event: ScreenEvent;
  detail: string | null;
  userName: string;
  userEmail: string;
  lessonTitle: string | null;
  courseTitle: string | null;
  ip: string | null;
  createdAt: Date;
};

export type ScreenEventReport = {
  rows: ScreenEventRow[];
  counts: { event: ScreenEvent; total: number }[];
  total: number;
};

export const SCREEN_EVENT_PAGE_SIZE = 50;

/** FR-15.8 — รายงานเหตุการณ์ล่าสุดให้ผู้ดูแลระบบ */
export async function getScreenEventReport(): Promise<ScreenEventReport> {
  await requireAtLeast(Role.SUPER_ADMIN);

  const [rows, grouped, total] = await Promise.all([
    db.screenEventLog.findMany({
      orderBy: { createdAt: "desc" },
      take: SCREEN_EVENT_PAGE_SIZE,
      select: {
        id: true,
        event: true,
        meta: true,
        ip: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        lesson: { select: { title: true, section: { select: { course: { select: { title: true } } } } } },
      },
    }),
    db.screenEventLog.groupBy({ by: ["event"], _count: { _all: true } }),
    db.screenEventLog.count(),
  ]);

  return {
    total,
    counts: grouped
      .map((g) => ({ event: g.event, total: g._count._all }))
      .sort((a, b) => b.total - a.total),
    rows: rows.map((row) => ({
      id: row.id,
      event: row.event,
      detail: (row.meta as { detail?: string } | null)?.detail ?? null,
      userName: row.user.name,
      userEmail: row.user.email,
      lessonTitle: row.lesson?.title ?? null,
      courseTitle: row.lesson?.section.course.title ?? null,
      ip: row.ip,
      createdAt: row.createdAt,
    })),
  };
}
