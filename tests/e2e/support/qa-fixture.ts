import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, LessonType } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `qa.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สเผยแพร่ 1 คอร์ส · ผู้สอน instructor · ผู้เรียน student · บทเรียนข้อความ 1 บท
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; courseTitle: string; instructorEmail: string; studentEmail: string };
export type QaFixture = { courseId: string; lessonId: string; studentId: string };

const actions = {
  async setup(a: SetupArgs): Promise<QaFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const course = await db.course.create({
      data: {
        title: a.courseTitle,
        slug: `e2e-qa-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: {
            title: "บทที่ 1",
            position: 0,
            lessons: {
              create: {
                title: "ทำความรู้จักตัวแปร",
                type: LessonType.TEXT,
                position: 0,
                content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ตัวแปรคือที่เก็บค่า" }] }] },
              },
            },
          },
        },
        enrollments: { create: { userId: student.id } },
      },
      include: { sections: { include: { lessons: true } } },
    });
    return { courseId: course.id, lessonId: course.sections[0]!.lessons[0]!.id, studentId: student.id };
  },

  /** สิทธิ์เรียนของ student หมดอายุ → อ่านได้อย่างเดียว */
  async expire(f: QaFixture) {
    await db.enrollment.update({
      where: { userId_courseId: { userId: f.studentId, courseId: f.courseId } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    return { ok: true };
  },

  async cleanup(f: QaFixture) {
    await db.notification.deleteMany({ where: { link: { startsWith: `/learn/${f.courseId}/qa/` } } });
    await db.course.deleteMany({ where: { id: f.courseId } });
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
