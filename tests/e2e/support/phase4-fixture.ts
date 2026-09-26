import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, LessonType, Visibility } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `phase-4.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สสาธารณะ 1,200 บาทของคณะบริหารธุรกิจ (BUS — ผู้ดูแลคณะในชุดทดสอบอยู่ SCI จึงต้องไม่เห็นยอดขาย)
 * + คูปองลด 25% เฉพาะคอร์สนี้ (ผู้ดูแลสร้างผ่านหน้าจอแล้วใน coupon.spec)
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; title: string; instructorEmail: string; coupon: string };
export type Phase4Fixture = { courseId: string; slug: string; coupon: string };

const actions = {
  async setup(a: SetupArgs): Promise<Phase4Fixture> {
    const [instructor, bus] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.department.findUniqueOrThrow({ where: { code: "BUS" } }),
    ]);
    const course = await db.course.create({
      data: {
        title: a.title,
        slug: `e2e-phase4-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
        enrollPolicy: EnrollPolicy.OPEN,
        price: "1200.00",
        departmentId: bus.id,
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: { create: { title: "บทที่ 1", position: 0, lessons: { create: { title: "เริ่มต้น", type: LessonType.TEXT, position: 0 } } } },
      },
    });
    await db.coupon.create({ data: { code: a.coupon, percentOff: 25, courseId: course.id } });
    return { courseId: course.id, slug: course.slug, coupon: a.coupon };
  },

  async cleanup(f: Phase4Fixture) {
    await db.certificate.deleteMany({ where: { courseId: f.courseId } });
    await db.order.deleteMany({ where: { courseId: f.courseId } });
    await db.coupon.deleteMany({ where: { code: f.coupon } });
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
