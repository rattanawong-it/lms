import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, LessonType, Visibility } from "../../../src/generated/prisma/enums";
import { nextDocumentNumber } from "../../../src/features/commerce/lib/receipt-number";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `receipt.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์ส 750 บาทต่อ project · `race` ออกเลขจากตัวนับพร้อมกันหลายทรานแซกชันด้วยโค้ดจริงของระบบ
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; title: string; instructorEmail: string; studentEmail: string };
export type ReceiptFixture = { courseId: string; studentId: string };
export type ReceiptState = {
  order: { id: string; status: string; receiptNo: string | null; billing: { seller: { name: string }; buyer: { email: string } } | null } | null;
};

const actions = {
  async setup(a: SetupArgs): Promise<ReceiptFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const course = await db.course.create({
      data: {
        title: a.title,
        slug: `e2e-receipt-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
        enrollPolicy: EnrollPolicy.OPEN,
        price: "750.00",
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: { create: { title: "บทที่ 1", position: 0, lessons: { create: { title: "เริ่มต้น", type: LessonType.TEXT, position: 0 } } } },
      },
    });
    return { courseId: course.id, studentId: student.id };
  },

  async inspect(f: ReceiptFixture): Promise<ReceiptState> {
    const order = await db.order.findFirst({
      where: { courseId: f.courseId, userId: f.studentId, status: "PAID" },
      select: { id: true, status: true, receiptNo: true, billing: true },
    });
    return { order: order as ReceiptState["order"] };
  },

  /** ออกเลข `count` ใบพร้อมกัน (คนละทรานแซกชัน) — ต้องได้ 1..count ไม่ซ้ำไม่ข้าม */
  async race(a: { key: string; count: number }): Promise<number[]> {
    const values = await Promise.all(
      Array.from({ length: a.count }, () => db.$transaction((tx) => nextDocumentNumber(tx, a.key))),
    );
    await db.documentCounter.delete({ where: { key: a.key } });
    return values.sort((x, y) => x - y);
  },

  async cleanup(f: ReceiptFixture) {
    await db.order.deleteMany({ where: { courseId: f.courseId } });
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
