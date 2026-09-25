import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, LessonType } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `reviews.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สเผยแพร่ · student เรียนไป 20% · ผู้เรียนอีกคน (ล็อกอินไม่ได้) รีวิวไว้แล้ว 2 ดาว
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; courseTitle: string; instructorEmail: string; studentEmail: string };
export type ReviewsFixture = { courseId: string; slug: string; studentId: string; otherId: string };

const actions = {
  async setup(a: SetupArgs): Promise<ReviewsFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const other = await db.user.create({
      data: { name: `ผู้รีวิวก่อนหน้า ${a.tag}`, email: `review-${a.tag}@example.com`, emailVerified: true },
    });
    const slug = `e2e-review-${a.tag}`;
    const course = await db.course.create({
      data: {
        title: a.courseTitle,
        slug,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: { title: "บทที่ 1", position: 0, lessons: { create: { title: "บทนำ", type: LessonType.TEXT, position: 0 } } },
        },
        enrollments: {
          create: [
            { userId: student.id, progressPct: 20 },
            { userId: other.id, progressPct: 100 },
          ],
        },
        reviews: { create: { userId: other.id, rating: 2, comment: "เนื้อหาน้อยไป" } },
        ratingAvg: 2,
        ratingCount: 1,
      },
    });
    return { courseId: course.id, slug, studentId: student.id, otherId: other.id };
  },

  async setProgress(f: ReviewsFixture & { pct: number }) {
    await db.enrollment.update({
      where: { userId_courseId: { userId: f.studentId, courseId: f.courseId } },
      data: { progressPct: f.pct },
    });
    return { ok: true };
  },

  async cleanup(f: ReviewsFixture) {
    await db.notification.deleteMany({ where: { link: { startsWith: `/courses/${f.slug}` } } });
    await db.course.deleteMany({ where: { id: f.courseId } });
    await db.user.deleteMany({ where: { id: f.otherId } });
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
