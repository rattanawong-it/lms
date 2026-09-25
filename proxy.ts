import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * ชั้นกรองแบบ optimistic (system-design §4.2)
 * ตรวจแค่ว่ามี session cookie หรือไม่ — ไม่ query DB เพื่อให้เร็ว
 * สิทธิ์จริงตรวจซ้ำใน Data Access Layer (src/lib/rbac.ts) เสมอ · NFR-04
 *
 * และเป็นที่ออก Content-Security-Policy ต่อ request (M15 · NFR-03)
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/my-courses",
  "/learn",
  "/quiz",
  "/certificates",
  "/notifications",
  "/settings",
  "/checkout",
  "/orders",
  "/teach",
  "/admin",
];

/** หน้าที่ผู้ login แล้วไม่ควรเข้า (จะเด้งกลับ dashboard) */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

/**
 * โดเมนที่ฝัง iframe ได้ — ต้องตรงกับ `EMBED_ORIGINS` ใน
 * `src/features/lesson-media/lib/embed.ts` ซึ่งเป็นตัวสร้าง URL ที่ฝังจริง
 */
const EMBED_FRAME_SRC = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"];

/**
 * วิดีโอบทเรียนเล่นจาก signed URL ของ storage โดยตรง (FR-15.7) จึงต้องอนุญาต `media-src`
 * ให้โดเมนนั้นด้วย — อ่านจาก env เดียวกับที่ `lib/storage.ts` ใช้ เพื่อให้ย้าย MinIO → R2
 * แล้ว CSP ตามไปเองโดยไม่ต้องแก้โค้ด (D-01)
 *
 * ไม่ import `lib/env.ts` เพราะไฟล์นั้นตรวจ env ของฝั่ง server ทั้งชุด ซึ่งหนักเกินจำเป็นตรงนี้
 */
function storageOrigin(): string | null {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const storage = storageOrigin();

  return [
    "default-src 'self'",
    // `strict-dynamic` ทำให้สคริปต์ที่ Next โหลดต่อเชื่อจาก nonce ตัวเดียว
    // dev ต้องมี `unsafe-eval` เพราะ React ใช้ eval สร้าง stack trace ของ server ให้อ่าน
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    // Radix, Tailwind และตัวเล่นสื่อของเราตั้งค่าผ่าน `style=""` ของ element ตรง ๆ
    // (เช่น แถบความคืบหน้าและขนาด canvas ของ PDF) — style attribute ต้องอนุญาตแยกจาก stylesheet
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // pdf.js สร้าง worker จากไฟล์ใน /_next/static และบางกรณีตกไปใช้ blob
    "worker-src 'self' blob:",
    `media-src 'self' blob:${storage ? ` ${storage}` : ""}`,
    "connect-src 'self'",
    `frame-src ${EMBED_FRAME_SRC.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // ซ้ำกับ X-Frame-Options: DENY ใน next.config.ts — เบราว์เซอร์รุ่นใหม่ใช้บรรทัดนี้
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

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

  // nonce ต้องใหม่ทุก request — Next อ่านจาก header นี้แล้วแปะให้สคริปต์ของตัวเองเอง
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // ข้ามไฟล์ static, รูป, และ /api/auth (Better Auth จัดการเอง)
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
