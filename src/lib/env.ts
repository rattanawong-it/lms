import { z } from "zod";

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

  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  SMTP_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("KRIRK LMS <no-reply@krirk.ac.th>"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
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
