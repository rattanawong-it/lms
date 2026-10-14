import { config } from "dotenv";

config({ quiet: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { LessonType } from "../../../src/generated/prisma/enums";

/**
 * ข้อมูลตั้งต้นของ `lesson-media.spec.ts` — รันด้วย tsx แยก process
 *
 *   tsx lesson-media-fixture.ts <action> '<json>'  → พิมพ์ผลเป็น JSON บรรทัดเดียว
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type LiveArgs = { courseSlug: string; title: string };

const actions = {
  /**
   * seed ตั้งคาบสดไว้ "อีก 7 วัน" นับจากวันที่ seed — พอเวลาผ่านไปคาบก็เลยแล้ว
   * เลื่อนให้อยู่อีก 7 วันจากตอนนี้ทุกครั้งที่รันเทสต์ (ไกลพอที่ cron `live` จะไม่แจ้ง)
   */
  async pushLiveForward(a: LiveArgs) {
    const now = Date.now();
    const { count } = await db.lesson.updateMany({
      where: { title: a.title, type: LessonType.LIVE, section: { course: { slug: a.courseSlug } } },
      data: { liveStartAt: new Date(now + 7 * DAY), liveEndAt: new Date(now + 7 * DAY + HOUR) },
    });
    if (count === 0) throw new Error(`ไม่พบคาบสด "${a.title}" ในคอร์ส ${a.courseSlug}`);
    return { count };
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
