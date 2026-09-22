"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { presignGet, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { getLessonAccess } from "@/features/enrollment/queries";
import { AssetKind, AssetStatus, LessonType, VideoSource } from "@/generated/prisma/enums";

/**
 * M05 · FR-05.2 / FR-15.7 — ออก signed URL ของไฟล์วิดีโอบทเรียน
 *
 * ทำไมไม่ฝัง URL ไว้ในหน้าตั้งแต่ตอน render
 * - URL มีอายุ 5 นาที ถ้าฝังมากับหน้า ผู้เรียนที่เปิดหน้าค้างไว้แล้วค่อยกดเล่นจะเจอลิงก์หมดอายุ
 * - และลิงก์จะไปติดอยู่ใน HTML/RSC payload ซึ่งถูกเก็บไว้ในแคชของ router ฝั่ง client
 * ตัวเล่นจึงขอ URL ตอนกดเล่นจริง และขอใหม่เมื่อใกล้หมดอายุ โดยตรวจสิทธิ์ซ้ำทุกครั้ง
 */
export type VideoUrlResult =
  | { ok: true; url: string; expiresInSec: number; startAtSec: number }
  | { ok: false; message: string };

/** ออก URL ใหม่ได้ไม่เกินเท่านี้ต่อผู้ใช้หนึ่งคนต่อชั่วโมง — กันการไล่ดูดไฟล์ทั้งคอร์ส */
const URL_QUOTA = { windowSec: 60 * 60, max: 120 };

export async function requestLessonVideoUrl(lessonId: string): Promise<VideoUrlResult> {
  const user = await requireUser();

  if (typeof lessonId !== "string" || lessonId.length === 0) {
    return { ok: false, message: "ไม่พบบทเรียน" };
  }

  const quota = rateLimit(`video-url:${user.id}`, URL_QUOTA);
  if (!quota.ok) {
    return { ok: false, message: "ขอเปิดวิดีโอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  // ด่านเดียวกับที่ M06 ใช้ — ตรวจ enrollment และกติกาเรียนตามลำดับพร้อมกัน
  const access = await getLessonAccess(lessonId);
  if (!access) return { ok: false, message: "ไม่พบบทเรียน" };
  if (!access.unlocked) return { ok: false, message: "ต้องเรียนบทก่อนหน้าให้จบก่อน" };
  if (access.lesson.type !== LessonType.VIDEO) {
    return { ok: false, message: "บทเรียนนี้ไม่ใช่วิดีโอ" };
  }

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      videoSource: true,
      asset: { select: { key: true, kind: true, status: true } },
    },
  });

  if (lesson?.videoSource !== VideoSource.UPLOAD) {
    return { ok: false, message: "บทเรียนนี้เล่นจากลิงก์ภายนอก ไม่ต้องขอ URL" };
  }
  if (
    !lesson.asset ||
    lesson.asset.kind !== AssetKind.VIDEO ||
    lesson.asset.status !== AssetStatus.READY
  ) {
    return { ok: false, message: "ยังไม่มีไฟล์วิดีโอของบทเรียนนี้" };
  }

  const url = await presignGet(lesson.asset.key);

  return {
    ok: true,
    url,
    expiresInSec: READ_URL_TTL_SECONDS,
    startAtSec: access.lastPositionSec,
  };
}
