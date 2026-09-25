import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../../src/generated/prisma/client";
import { CourseStatus, LessonType } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `phase-3.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สเผยแพร่ · student เรียนไปแล้ว 50% (รีวิวได้) · เปิดอีเมล "ถาม-ตอบ" ของ instructor ชั่วคราว
 * การตั้งค่าเป็นของบัญชีที่ทุก project ใช้ร่วมกัน — เปิดเฉพาะ project ที่ส่ง `emailPrefs: true` (desktop)
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; courseTitle: string; instructorEmail: string; studentEmail: string; emailPrefs: boolean };
export type Phase3Fixture = { courseId: string; slug: string; instructorId: string; emailPrefs: boolean };

async function setQaEmail(userId: string, on: boolean) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyPrefs: true } });
  const rest = { ...((user.notifyPrefs ?? {}) as Record<string, unknown>) };
  delete rest.QA_REPLY;
  const next = on ? { ...rest, QA_REPLY: { email: true, line: false } } : rest;
  await db.user.update({ where: { id: userId }, data: { notifyPrefs: next as Prisma.InputJsonValue } });
}

const actions = {
  async setup(a: SetupArgs): Promise<Phase3Fixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const slug = `e2e-phase3-${a.tag}`;
    const course = await db.course.create({
      data: {
        title: a.courseTitle,
        slug,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: {
          create: {
            title: "บทที่ 1",
            position: 0,
            lessons: { create: { title: "บทนำ", type: LessonType.TEXT, position: 0 } },
          },
        },
        enrollments: { create: { userId: student.id, progressPct: 50 } },
      },
    });
    // เปิดเฉพาะอีเมล QA_REPLY — ชนิดอื่นคงค่าเดิม · cleanup ลบ key นี้ทิ้ง (กลับไปใช้ค่าเริ่มต้น = ปิด)
    if (a.emailPrefs) await setQaEmail(instructor.id, true);
    return { courseId: course.id, slug, instructorId: instructor.id, emailPrefs: a.emailPrefs };
  },

  async cleanup(f: Phase3Fixture) {
    if (f.emailPrefs) await setQaEmail(f.instructorId, false);
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
