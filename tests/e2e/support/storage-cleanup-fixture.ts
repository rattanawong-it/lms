import { config } from "dotenv";

config({ quiet: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { AssetKind, AssetStatus, LessonType } from "../../../src/generated/prisma/enums";

/**
 * ข้อมูลตั้งต้นของ `storage-cleanup.spec.ts` (CHANGELOG #55) — รันด้วย tsx แยก process
 *
 * สร้าง Asset ย้อนเวลาไว้ทุกแบบที่ `findOrphanAssets()` ต้องแยกให้ถูก ไม่สร้าง object จริงใน storage
 * (S3 ลบ key ที่ไม่มีอยู่ถือว่าสำเร็จ) · `createdAt` ย้อนไป 400 วันให้อยู่ต้นคิวของ batch
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DAY = 24 * 60 * 60 * 1000;

/** ชื่อ → ควรถูกลบไหม */
export const CASES = {
  orphanOld: true, // ไม่มีใครใช้ เกิน 30 วัน
  uploadingOld: true, // อัปโหลดไม่จบ เกิน 1 วัน
  orphanRecent: false, // ไม่มีใครใช้ แต่ยังไม่ครบ 30 วัน
  lessonVideo: false, // Lesson.assetId
  attachment: false, // LessonAttachment
  cover: false, // Course.coverKey
  richText: false, // /api/media/<id> ในเนื้อหาบทเรียน
  certificateLogo: false, // Course.certificateTemplate.logoAssetId
  avatar: false, // User.image
} as const;
export type CaseName = keyof typeof CASES;

type Fixture = { courseId: string; tempUserId: string; assets: Record<CaseName, string> };

const actions = {
  async setup(a: { tag: string; instructorEmail: string }): Promise<Fixture> {
    const instructor = await db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } });
    const now = Date.now();
    const assets = {} as Record<CaseName, { id: string; key: string }>;
    for (const name of Object.keys(CASES) as CaseName[]) {
      const asset = await db.asset.create({
        data: {
          key: `e2e-cleanup/${a.tag}/${name}`,
          kind: name === "lessonVideo" ? AssetKind.VIDEO : AssetKind.IMAGE,
          mime: name === "lessonVideo" ? "video/mp4" : "image/png",
          size: 1024,
          originalName: `${name}.png`,
          status: name === "uploadingOld" ? AssetStatus.UPLOADING : AssetStatus.READY,
          uploadedById: instructor.id,
          createdAt: new Date(now - (name === "orphanRecent" ? 10 : 400) * DAY),
        },
      });
      assets[name] = asset;
    }

    const media = (name: CaseName) => `/api/media/${assets[name].id}`;
    const course = await db.course.create({
      data: {
        title: `คอร์สเก็บกวาดไฟล์ ${a.tag}`,
        slug: `e2e-cleanup-${a.tag}`,
        coverKey: assets.cover.key,
        certificateTemplate: { logoAssetId: assets.certificateLogo.id, signatureAssetId: null },
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: {
            title: "บทที่ 1",
            position: 0,
            lessons: {
              create: [
                { title: "วิดีโอ", type: LessonType.VIDEO, position: 0, assetId: assets.lessonVideo.id },
                {
                  title: "ข้อความ",
                  type: LessonType.TEXT,
                  position: 1,
                  content: { type: "doc", content: [{ type: "image", attrs: { src: media("richText") } }] },
                  attachments: { create: { assetId: assets.attachment.id } },
                },
              ],
            },
          },
        },
      },
    });
    const temp = await db.user.create({
      data: { name: `ผู้ใช้เก็บกวาด ${a.tag}`, email: `cleanup-${a.tag}@example.com`, image: media("avatar") },
    });

    return {
      courseId: course.id,
      tempUserId: temp.id,
      assets: Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, v.id])) as Record<CaseName, string>,
    };
  },

  /** รหัส Asset ของ fixture ที่ยังอยู่ใน DB */
  async remaining(f: Fixture): Promise<string[]> {
    const rows = await db.asset.findMany({ where: { id: { in: Object.values(f.assets) } }, select: { id: true } });
    return rows.map((r) => r.id);
  },

  async cleanup(f: Fixture) {
    await db.course.deleteMany({ where: { id: f.courseId } });
    await db.user.deleteMany({ where: { id: f.tempUserId } });
    await db.asset.deleteMany({ where: { id: { in: Object.values(f.assets) } } });
    return { ok: true };
  },
};

export type StorageCleanupFixture = Fixture;

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
