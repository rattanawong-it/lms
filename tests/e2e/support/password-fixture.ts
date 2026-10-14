import { createHmac, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `password.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * ผู้ใช้ชั่วคราวที่ "เข้าด้วย Google อย่างเดียว" (มีแต่แถว Account google) + session 2 เครื่อง
 * ไม่ล็อกอินจริงเพราะโควตาล็อกอินเต็มแล้ว (CLAUDE.md §6) และไม่แตะรหัสของบัญชีทดสอบหลัก
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

export type PasswordFixture = {
  userId: string;
  /** ค่า cookie `session_token` ที่เซ็นแล้ว ของ "เครื่องนี้" */
  cookie: string;
};

export type PasswordState = {
  sessions: number;
  passwordHash: string | null;
  audit: string[];
};

/** เซ็นแบบเดียวกับ better-call `signCookieValue()` — `${token}.${base64(HMAC-SHA256)}` แล้ว URI-encode */
function signCookie(token: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("ไม่พบ BETTER_AUTH_SECRET");
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

const actions = {
  async setup(a: { tag: string }): Promise<PasswordFixture> {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 86_400_000);
    const user = await db.user.create({
      data: {
        name: `ผู้ใช้ Google ${a.tag}`,
        email: `pw-${a.tag}@example.com`,
        emailVerified: true,
        pdpaConsentAt: new Date(),
        accounts: { create: { providerId: "google", accountId: `google-${a.tag}` } },
        sessions: {
          create: [
            { token, expiresAt },
            { token: randomBytes(24).toString("hex"), expiresAt }, // อุปกรณ์อื่น
          ],
        },
      },
    });
    return { userId: user.id, cookie: signCookie(token) };
  },

  async state(f: PasswordFixture): Promise<PasswordState> {
    const [sessions, credential, audit] = await Promise.all([
      db.session.count({ where: { userId: f.userId } }),
      db.account.findFirst({ where: { userId: f.userId, providerId: "credential" }, select: { password: true } }),
      db.auditLog.findMany({ where: { actorId: f.userId }, orderBy: { createdAt: "asc" }, select: { action: true } }),
    ]);
    return { sessions, passwordHash: credential?.password ?? null, audit: audit.map((r) => r.action) };
  },

  async cleanup(f: PasswordFixture) {
    await db.auditLog.deleteMany({ where: { actorId: f.userId } });
    await db.user.deleteMany({ where: { id: f.userId } });
    return { ok: true };
  },
};

async function main() {
  const [action, json] = process.argv.slice(2);
  try {
    const run = actions[action as keyof typeof actions] as (a: unknown) => Promise<unknown>;
    process.stdout.write(JSON.stringify(await run(JSON.parse(json ?? "{}"))));
  } finally {
    await db.$disconnect();
  }
}

void main();
