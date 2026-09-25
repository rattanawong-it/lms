import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollmentStatus, LessonType, SubmissionStatus } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `reports.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 *
 * คอร์ส A (คณะของ dept-admin): student ACTIVE 20% · ผู้เรียนชั่วคราว COMPLETED / ACTIVE / PENDING
 *   → นับ 3 คน จบ 1 = 33.3% · งานรอตรวจ 1 · คำถามยังไม่มีคำตอบ 1 · คาบสดอีก 2 วัน
 * คอร์ส B (คณะอื่น): ผู้ดูแลคณะต้องมองไม่เห็น
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; titleA: string; titleB: string; instructorEmail: string; studentEmail: string; deptAdminEmail: string };
export type ReportsFixture = { courseA: string; courseB: string; tempUserIds: string[]; liveTitle: string };

const actions = {
  async setup(a: SetupArgs): Promise<ReportsFixture> {
    const [instructor, student, deptAdmin] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.deptAdminEmail } }),
    ]);
    const deptA = deptAdmin.departmentId!;
    const deptB = (await db.department.findFirstOrThrow({ where: { id: { not: deptA } }, select: { id: true } })).id;
    const temps = await Promise.all(
      ["done", "doing", "waiting"].map((k) =>
        db.user.create({ data: { name: `ผู้เรียนรายงาน ${k} ${a.tag}`, email: `report-${k}-${a.tag}@example.com`, emailVerified: true } }),
      ),
    );
    const liveTitle = `คาบสดรายงาน ${a.tag}`;
    const now = Date.now();

    const courseA = await db.course.create({
      data: {
        title: a.titleA,
        slug: `e2e-report-a-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(now),
        departmentId: deptA,
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: {
            title: "บทที่ 1",
            position: 0,
            lessons: {
              create: [
                { title: "ส่งงาน", type: LessonType.ASSIGNMENT, position: 0 },
                { title: liveTitle, type: LessonType.LIVE, position: 1, liveUrl: "https://meet.google.com/abc-defg-hij", liveStartAt: new Date(now + 2 * 86_400_000) },
              ],
            },
          },
        },
        enrollments: {
          create: [
            { userId: student.id, progressPct: 20 },
            { userId: temps[0]!.id, status: EnrollmentStatus.COMPLETED, progressPct: 100, completedAt: new Date(now) },
            { userId: temps[1]!.id, progressPct: 50 },
            { userId: temps[2]!.id, status: EnrollmentStatus.PENDING },
          ],
        },
        threads: { create: { authorId: temps[1]!.id, title: "คำถามที่ยังไม่มีคำตอบ", body: "ช่วยอธิบายอีกครั้ง" } },
      },
      include: { sections: { include: { lessons: true } } },
    });
    const lesson = courseA.sections[0]!.lessons.find((l) => l.type === LessonType.ASSIGNMENT)!;
    await db.assignment.create({
      data: {
        courseId: courseA.id,
        lessonId: lesson.id,
        title: "งานรายงาน",
        instructions: { type: "doc", content: [] },
        maxScore: 10,
        allowedTypes: ["pdf"],
        submissions: { create: { userId: temps[1]!.id, text: "ส่งแล้ว", status: SubmissionStatus.SUBMITTED } },
      },
    });

    const courseB = await db.course.create({
      data: {
        title: a.titleB,
        slug: `e2e-report-b-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(now),
        departmentId: deptB,
        instructors: { create: { userId: instructor.id } },
        enrollments: { create: { userId: temps[0]!.id } },
      },
    });
    return { courseA: courseA.id, courseB: courseB.id, tempUserIds: temps.map((t) => t.id), liveTitle };
  },

  async cleanup(f: ReportsFixture) {
    await db.course.deleteMany({ where: { id: { in: [f.courseA, f.courseB] } } });
    await db.thread.deleteMany({ where: { authorId: { in: f.tempUserIds } } });
    await db.user.deleteMany({ where: { id: { in: f.tempUserIds } } });
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
