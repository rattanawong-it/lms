import type { NextConfig } from "next";

/** NFR-03 · security headers (system-design §9) */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // เปิด forbidden() / unauthorized() สำหรับ Data Access Layer (§4.2)
    authInterrupts: true,
  },
  // ใบประกาศ/ใบเสร็จ PDF อ่านฟอนต์ด้วย path.join(process.cwd(), …) ซึ่ง file tracing ตามไม่เจอ
  // บน Vercel ไฟล์ที่ไม่ถูก trace จะไม่ไปกับ function — ออกได้จากหลาย action จึงรวมให้ทุก route (~300 KB)
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/anuphan/*.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
