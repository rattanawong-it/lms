import { createHmac, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `avatar.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * ผู้ใช้ชั่วคราวที่เข้าด้วย Google (มีรูปจาก Google อยู่แล้ว) + session ที่สร้างตรงใน DB
 * ไม่ล็อกอินจริงเพราะโควตาล็อกอินเต็มแล้ว (CLAUDE.md §6) และไม่แตะรูปของบัญชีทดสอบหลัก
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const GOOGLE_IMAGE = "https://lh3.googleusercontent.com/a/e2e-avatar=s96-c";

export type AvatarFixture = { userId: string; cookie: string };

export type AvatarState = {
  image: string | null;
  assets: { id: string; key: string; mime: string; status: string }[];
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
  async setup(a: { tag: string }): Promise<AvatarFixture> {
    const token = randomBytes(24).toString("hex");
    const user = await db.user.create({
      data: {
        name: `ผู้ใช้รูป ${a.tag}`,
        email: `avatar-${a.tag}@example.com`,
        emailVerified: true,
        image: GOOGLE_IMAGE,
        pdpaConsentAt: new Date(),
        accounts: { create: { providerId: "google", accountId: `google-avatar-${a.tag}` } },
        sessions: { create: { token, expiresAt: new Date(Date.now() + 86_400_000) } },
      },
    });
    return { userId: user.id, cookie: signCookie(token) };
  },

  async state(f: AvatarFixture): Promise<AvatarState> {
    const [user, assets, audit] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: f.userId }, select: { image: true } }),
      db.asset.findMany({
        where: { uploadedById: f.userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, key: true, mime: true, status: true },
      }),
      db.auditLog.findMany({
        where: { actorId: f.userId, action: { startsWith: "user.avatar" } },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      }),
    ]);
    return { image: user.image, assets, audit: audit.map((r) => r.action) };
  },

  async cleanup(f: AvatarFixture) {
    await db.auditLog.deleteMany({ where: { actorId: f.userId } });
    await db.asset.deleteMany({ where: { uploadedById: f.userId } });
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
