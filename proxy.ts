import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * ชั้นกรองแบบ optimistic (system-design §4.2)
 * ตรวจแค่ว่ามี session cookie หรือไม่ — ไม่ query DB เพื่อให้เร็ว
 * สิทธิ์จริงตรวจซ้ำใน Data Access Layer (src/lib/rbac.ts) เสมอ · NFR-04
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/my-courses",
  "/learn",
  "/quiz",
  "/certificates",
  "/notifications",
  "/settings",
  "/teach",
  "/admin",
];

/** หน้าที่ผู้ login แล้วไม่ควรเข้า (จะเด้งกลับ dashboard) */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: "krirk-lms" }));

  if (!hasSession && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && GUEST_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // ข้ามไฟล์ static, รูป, และ /api/auth (Better Auth จัดการเอง)
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
