import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env, hasGoogleOAuth } from "@/lib/env";
import { renderEmail, sendMail } from "@/lib/mail";
import { ac, roles } from "@/lib/permissions";

/**
 * M01 — Authentication & Account
 * FR-01.1 สมัครด้วย Email/Password · FR-01.2 Google OAuth · FR-01.3 ยืนยันอีเมล
 * FR-01.4 ลืมรหัสผ่าน (ลิงก์อายุ 1 ชม.) · FR-01.6 จัดการ session · FR-01.7 rate limit
 */
export const auth = betterAuth({
  appName: "KRIRK LMS",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: prismaAdapter(db, { provider: "postgresql" }),

  // FR-01.1 · FR-01.3 · FR-01.4
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 ชั่วโมง (FR-01.4)
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "ตั้งรหัสผ่านใหม่ · KRIRK LMS",
        html: renderEmail({
          heading: "ตั้งรหัสผ่านใหม่",
          body: `เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${user.email} กดปุ่มด้านล่างเพื่อดำเนินการต่อ`,
          ctaLabel: "ตั้งรหัสผ่านใหม่",
          ctaUrl: url,
          footnote:
            "ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้เป็นผู้ขอ ให้เพิกเฉยต่ออีเมลฉบับนี้",
        }),
      });
    },
  },

  // FR-01.3 ยืนยันอีเมลด้วยลิงก์
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1 ชั่วโมง
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "ยืนยันอีเมลของคุณ · KRIRK LMS",
        html: renderEmail({
          heading: "ยืนยันอีเมลของคุณ",
          body: `สวัสดีคุณ ${user.name} กดปุ่มด้านล่างเพื่อยืนยันอีเมล ${user.email} แล้วเริ่มใช้งานระบบได้ทันที`,
          ctaLabel: "ยืนยันอีเมล",
          ctaUrl: url,
          footnote: "ลิงก์นี้หมดอายุใน 1 ชั่วโมง หากไม่ได้สมัครใช้งาน ให้เพิกเฉยต่ออีเมลฉบับนี้",
        }),
      });
    },
  },

  // FR-01.2 — เปิดใช้เมื่อกำหนด GOOGLE_CLIENT_ID/SECRET ใน .env แล้วเท่านั้น
  socialProviders: hasGoogleOAuth
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},

  // ผูกบัญชี Google เข้ากับบัญชีอีเมลเดิมที่ยืนยันแล้ว (FR-01.2)
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  // FR-01.6 ดูและยกเลิก session บนอุปกรณ์อื่น
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 วัน
    updateAge: 60 * 60 * 24, // ต่ออายุวันละครั้ง
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // ฟิลด์เพิ่มเติมของ User ตาม schema (system-design §3.2)
  user: {
    additionalFields: {
      departmentId: { type: "string", required: false, input: false },
      phone: { type: "string", required: false, input: false },
      externalId: { type: "string", required: false, input: false },
      pdpaConsentAt: { type: "date", required: false, input: false },
    },
  },

  // FR-01.7 จำกัดความถี่การ login
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/forget-password": { window: 60 * 60, max: 5 },
    },
  },

  // FR-01.8 — บันทึกเวลาที่ให้ความยินยอม PDPA ตอนสร้างบัญชี
  // (หน้า /register บังคับติ๊กยอมรับ ส่วนการเข้าสู่ระบบด้วย Google แจ้งไว้ที่หน้า /login)
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, pdpaConsentAt: new Date() },
        }),
      },
    },
  },

  advanced: {
    cookiePrefix: "krirk-lms",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax" },
  },

  plugins: [
    // §2 · ผู้สมัครใหม่ได้ role STUDENT เสมอ · เฉพาะ SUPER_ADMIN ที่เป็น admin เต็มระบบ
    admin({
      ac,
      roles,
      defaultRole: "STUDENT",
      adminRoles: ["SUPER_ADMIN"],
      bannedUserMessage: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบของคณะ",
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
