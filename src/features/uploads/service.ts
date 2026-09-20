import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";
import { isAtLeast, type SessionUser } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";

/**
 * ตัวช่วยร่วมของ Route Handler ตระกูล /api/upload/*
 * ใช้ NextResponse แทน forbidden()/unauthorized() เพราะ API ต้องตอบ JSON ให้ client จัดการต่อ
 */
export type ApiFailure = { response: NextResponse };

export function jsonError(message: string, status: number): ApiFailure {
  return { response: NextResponse.json({ ok: false, message }, { status }) };
}

/**
 * ผู้มีสิทธิ์อัปโหลดในเฟสนี้คือผู้สอนขึ้นไป
 * (ผู้เรียนจะได้สิทธิ์อัปโหลดไฟล์ส่งงานใน M08 เฟส 2 — ต้องขยายเงื่อนไขตรงนี้ตอนนั้น)
 */
export async function requireUploader(): Promise<SessionUser | ApiFailure> {
  const user = await getSessionUser();
  if (!user) return jsonError("ต้องเข้าสู่ระบบก่อน", 401);
  if (user.banned) return jsonError("บัญชีนี้ถูกระงับการใช้งาน", 403);
  if (!isAtLeast(user, Role.INSTRUCTOR)) return jsonError("ไม่มีสิทธิ์อัปโหลดไฟล์", 403);
  return user;
}

export function isFailure(value: SessionUser | ApiFailure): value is ApiFailure {
  return "response" in value;
}

/** หา Asset ที่ยังอัปโหลดค้างอยู่ และต้องเป็นของผู้ใช้คนนี้เท่านั้น */
export async function findOwnPendingAsset(assetId: string, userId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      key: true,
      kind: true,
      mime: true,
      size: true,
      status: true,
      uploadedById: true,
    },
  });
  if (!asset || asset.uploadedById !== userId) return null;
  if (asset.status !== "UPLOADING") return null;
  return asset;
}
