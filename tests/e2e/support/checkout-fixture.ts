import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, LessonType, Visibility } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `checkout.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สสาธารณะ 750 บาทต่อ project (ผู้เรียนบัญชีเดียวกันซื้อคนละคอร์ส)
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; title: string; instructorEmail: string; studentEmail: string };
export type CheckoutFixture = { courseId: string; slug: string; studentId: string };
export type CheckoutState = {
  orders: { id: string; status: string; providerRef: string | null; method: string | null }[];
  enrollment: { status: string; source: string } | null;
  paidAudits: number;
};

const actions = {
  async setup(a: SetupArgs): Promise<CheckoutFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const course = await db.course.create({
      data: {
        title: a.title,
        slug: `e2e-checkout-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
        enrollPolicy: EnrollPolicy.OPEN,
        price: "750.00",
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
        sections: { create: { title: "บทที่ 1", position: 0, lessons: { create: { title: "เริ่มต้น", type: LessonType.TEXT, position: 0 } } } },
      },
    });
    return { courseId: course.id, slug: course.slug, studentId: student.id };
  },

  async inspect(f: CheckoutFixture): Promise<CheckoutState> {
    const [orders, enrollment] = await Promise.all([
      db.order.findMany({
        where: { courseId: f.courseId, userId: f.studentId },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, providerRef: true, method: true },
      }),
      db.enrollment.findUnique({
        where: { userId_courseId: { userId: f.studentId, courseId: f.courseId } },
        select: { status: true, source: true },
      }),
    ]);
    const paidAudits = await db.auditLog.count({ where: { action: "order.paid", entityId: { in: orders.map((o) => o.id) } } });
    return { orders, enrollment, paidAudits };
  },

  /** ทำให้คำสั่งซื้อ PENDING หมดอายุ (ทดสอบ cron) */
  async expire(a: { orderId: string }) {
    await db.order.update({ where: { id: a.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    return { ok: true };
  },

  async cleanup(f: CheckoutFixture) {
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
