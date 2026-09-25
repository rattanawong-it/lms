import { config } from "dotenv";

config({ quiet: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, LessonType, NotificationType } from "../../../src/generated/prisma/enums";

/**
 * ข้อมูลตั้งต้นของ `cron.spec.ts` — รันด้วย tsx แยก process
 * (Prisma client ที่ generate เป็น ESM ใช้ `import.meta` ซึ่ง Playwright โหลดแบบ CommonJS ไม่ได้)
 *
 *   tsx cron-fixture.ts <action> '<json>'  → พิมพ์ผลเป็น JSON บรรทัดเดียว
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const HOUR = 60 * 60 * 1000;

type SetupArgs = { tag: string; instructorEmail: string; studentEmail: string; assignmentTitle: string; liveTitle: string };
type Fixture = { courseId: string; lessonId: string; assignmentId: string; liveLessonId: string; studentId: string; tempUserId: string; tempEmail: string };

const actions = {
  /** คอร์สเผยแพร่ · งานครบกำหนดใน 5 ชม. · คาบสดเริ่มใน 30 นาที · ผู้เรียน student + บัญชีชั่วคราวที่ใช้ค่าเริ่มต้น */
  async setup(a: SetupArgs): Promise<Fixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const tempEmail = `cron-${a.tag}@example.com`;
    const temp = await db.user.create({ data: { name: `ผู้เรียนชั่วคราว ${a.tag}`, email: tempEmail, emailVerified: true } });
    const now = Date.now();
    const course = await db.course.create({
      data: {
        title: `คอร์ส cron ${a.tag}`,
        slug: `e2e-cron-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(now),
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: {
            title: "บทที่ 1",
            position: 0,
            lessons: {
              create: [
                { title: "ส่งงาน", type: LessonType.ASSIGNMENT, position: 0 },
                {
                  title: a.liveTitle,
                  type: LessonType.LIVE,
                  position: 1,
                  liveUrl: "https://meet.google.com/abc-defg-hij",
                  liveStartAt: new Date(now + HOUR / 2),
                },
              ],
            },
          },
        },
        enrollments: { create: [{ userId: student.id }, { userId: temp.id }] },
      },
      include: { sections: { include: { lessons: true } } },
    });
    const lessons = course.sections[0]!.lessons;
    const lesson = lessons.find((l) => l.type === LessonType.ASSIGNMENT)!;
    const assignment = await db.assignment.create({
      data: {
        courseId: course.id,
        lessonId: lesson.id,
        title: a.assignmentTitle,
        instructions: { type: "doc", content: [] },
        dueAt: new Date(now + 5 * HOUR),
        maxScore: 10,
        allowedTypes: ["pdf"],
      },
    });
    return {
      courseId: course.id,
      lessonId: lesson.id,
      assignmentId: assignment.id,
      liveLessonId: lessons.find((l) => l.type === LessonType.LIVE)!.id,
      studentId: student.id,
      tempUserId: temp.id,
      tempEmail,
    };
  },

  /** การแจ้งเตือนของผู้ใช้ที่มาจากงาน/คาบสดของ fixture นี้ */
  async notifications(f: Fixture) {
    return db.notification.findMany({
      where: {
        OR: [
          { dedupeKey: { startsWith: `due:${f.assignmentId}:` } },
          { dedupeKey: { startsWith: `live:${f.liveLessonId}:` } },
        ],
      },
      select: { userId: true, type: true, title: true, link: true, dedupeKey: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /** student ส่งงานแล้ว + ผู้สอนเลื่อนกำหนดส่งออกไปอีก 1 ชม. */
  async submitAndPostpone(f: Fixture) {
    await db.submission.create({ data: { assignmentId: f.assignmentId, userId: f.studentId, text: "ส่งแล้ว" } });
    await db.assignment.update({ where: { id: f.assignmentId }, data: { dueAt: new Date(Date.now() + 6 * HOUR) } });
    return { ok: true };
  },

  async cleanup(f: Fixture) {
    await db.notification.deleteMany({
      where: {
        OR: [
          { dedupeKey: { startsWith: `due:${f.assignmentId}:` } },
          { dedupeKey: { startsWith: `live:${f.liveLessonId}:` } },
        ],
      },
    });
    await db.course.deleteMany({ where: { id: f.courseId } });
    await db.user.deleteMany({ where: { id: f.tempUserId } });
    return { ok: true };
  },
};

export type CronFixture = Fixture;
export type CronNotification = { userId: string; type: NotificationType; title: string; link: string | null; dedupeKey: string | null };

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
