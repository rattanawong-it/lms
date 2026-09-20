import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** NFR-12 — health check (ตรวจว่าแอปและ DB ตอบสนอง) */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
