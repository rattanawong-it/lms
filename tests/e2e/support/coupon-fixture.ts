import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, LessonType, Visibility } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `coupon.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * ต่อ project: คอร์ส 750 บาท 2 คอร์ส (ซื้อด้วยคูปองลดบางส่วน / ลดเต็มจำนวน) + คูปองหมดอายุ 1 ใบ
 * คูปองที่ใช้จริงผู้ดูแลสร้างผ่านหน้า `/admin/coupons` ในเทสต์
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; title: string; instructorEmail: string; studentEmail: string; expiredCode: string };
export type CouponFixture = { courseId: string; freeCourseId: string; studentId: string; codes: string[] };
export type CouponState = {
  orders: { courseId: string; status: string; subtotal: string; discount: string; amount: string; couponCode: string | null; method: string | null }[];
  coupons: Record<string, number>;
  enrollments: { courseId: string; source: string }[];
};

async function course(tag: string, title: string, instructorId: string) {
  return db.course.create({
    data: {
      title,
      slug: `e2e-coupon-${tag}`,
      status: CourseStatus.PUBLISHED,
      visibility: Visibility.PUBLIC,
      enrollPolicy: EnrollPolicy.OPEN,
      price: "750.00",
      publishedAt: new Date(),
      instructors: { create: { userId: instructorId } },
      sections: { create: { title: "บทที่ 1", position: 0, lessons: { create: { title: "เริ่มต้น", type: LessonType.TEXT, position: 0 } } } },
    },
    select: { id: true },
  });
}

const actions = {
  async setup(a: SetupArgs): Promise<CouponFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    const paid = await course(a.tag, a.title, instructor.id);
    const free = await course(`${a.tag}-free`, `${a.title} (ฟรีด้วยคูปอง)`, instructor.id);
    await db.coupon.create({
      data: { code: a.expiredCode, percentOff: 50, courseId: paid.id, validUntil: new Date(Date.now() - 60_000) },
    });
    return { courseId: paid.id, freeCourseId: free.id, studentId: student.id, codes: [a.expiredCode] };
  },

  async inspect(f: CouponFixture & { codes: string[] }): Promise<CouponState> {
    const courseIds = [f.courseId, f.freeCourseId];
    const [orders, coupons, enrollments] = await Promise.all([
      db.order.findMany({
        where: { courseId: { in: courseIds }, userId: f.studentId },
        orderBy: { createdAt: "asc" },
        select: { courseId: true, status: true, subtotal: true, discount: true, amount: true, couponCode: true, method: true },
      }),
      db.coupon.findMany({ where: { code: { in: f.codes } }, select: { code: true, usedCount: true } }),
      db.enrollment.findMany({ where: { courseId: { in: courseIds }, userId: f.studentId }, select: { courseId: true, source: true } }),
    ]);
    return {
      orders: orders.map((o) => ({ ...o, subtotal: o.subtotal.toString(), discount: o.discount.toString(), amount: o.amount.toString() })),
      coupons: Object.fromEntries(coupons.map((c) => [c.code, c.usedCount])),
      enrollments,
    };
  },

  async cleanup(f: CouponFixture) {
    const courseIds = [f.courseId, f.freeCourseId];
    await db.order.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.coupon.deleteMany({ where: { code: { in: f.codes } } });
    await db.course.deleteMany({ where: { id: { in: courseIds } } });
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
