import { z } from "zod";
import { mockPaymentForbidden } from "@/lib/payment/guard";

/**
 * ตรวจ environment variables ตอนเริ่มระบบ (system-design §10.1)
 * ถ้าค่าที่จำเป็นหายไปจะ fail fast พร้อมข้อความภาษาไทย
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "ต้องกำหนด DATABASE_URL"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL ต้องเป็น URL ที่ถูกต้อง"),
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL ต้องเป็น URL ที่ถูกต้อง"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Storage (D-01) — MinIO ระหว่างพัฒนา, Cloudflare R2 ตอน deploy
  S3_ENDPOINT: z.url("S3_ENDPOINT ต้องเป็น URL ที่ถูกต้อง"),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1, "ต้องกำหนด S3_BUCKET"),
  S3_ACCESS_KEY_ID: z.string().min(1, "ต้องกำหนด S3_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "ต้องกำหนด S3_SECRET_ACCESS_KEY"),
  // MinIO ต้องใช้ path-style (http://host/bucket/key) ส่วน R2 ใช้ virtual-host
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),

  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  SMTP_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("KRIRK LMS <no-reply@krirk.ac.th>"),

  // LINE Messaging API (M12) — ไม่บังคับ · ไม่กำหนด = ปิดช่องทาง LINE ทั้งระบบ
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  // Basic ID ของ Official Account เช่น "@krirklms" — ใช้ทำลิงก์/QR เพิ่มเพื่อน
  LINE_OA_BASIC_ID: z.string().optional(),
  // ปลายทาง Messaging API — เปลี่ยนเฉพาะตอนทดสอบ (ชี้ไปที่ที่ไม่มีอยู่จริงเพื่อไม่ยิง LINE จริง)
  LINE_API_URL: z.url().default("https://api.line.me"),

  // Payment (M18 · D-05) — ไม่กำหนด = ปิดการขาย (คอร์สที่มีราคาแสดง "ยังไม่เปิดขาย")
  // "mock" = หน้าชำระเงินจำลองในแอป ใช้ตอนพัฒนา/e2e เท่านั้น — ห้ามใช้ใน production (ตรวจด้านล่าง)
  PAYMENT_PROVIDER: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["mock"]).optional()),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_PUBLIC_KEY: z.string().optional(),
  // ใช้ตรวจลายเซ็น webhook · ว่างใน .env ถือว่าไม่กำหนด
  PAYMENT_WEBHOOK_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16, "PAYMENT_WEBHOOK_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร").optional(),
  ),

  // cron (FR-12.3, NFR-05) — ผู้เรียก `/api/cron/*` ต้องส่ง `Authorization: Bearer <ค่านี้>`
  // ไม่กำหนด = ปิด cron ทั้งหมด (ตอบ 404) · ว่างใน .env ถือว่าไม่กำหนด
  CRON_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16, "CRON_SECRET ต้องยาวอย่างน้อย 16 ตัวอักษร").optional(),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const checkedEnvSchema = serverEnvSchema.superRefine((e, ctx) => {
  if (mockPaymentForbidden({ ...process.env, PAYMENT_PROVIDER: e.PAYMENT_PROVIDER })) {
    ctx.addIssue({
      code: "custom",
      path: ["PAYMENT_PROVIDER"],
      message: "ห้ามใช้ PAYMENT_PROVIDER=mock ใน production (ตั้ง ALLOW_MOCK_PAYMENT=true ได้เฉพาะเครื่องทดสอบ)",
    });
  }
});

function loadEnv(): ServerEnv {
  const parsed = checkedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`ค่าใน .env ไม่ถูกต้อง:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

/** Google OAuth พร้อมใช้งานหรือไม่ (FR-01.2) */
export const hasGoogleOAuth = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** เปิดขายคอร์สได้หรือไม่ (M18) — ต้องมีผู้ให้บริการและ secret ของ webhook */
export const hasPayment = Boolean(env.PAYMENT_PROVIDER && env.PAYMENT_WEBHOOK_SECRET);

/** ช่องทาง LINE พร้อมใช้งานหรือไม่ (M12) */
export const hasLine = Boolean(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN);
