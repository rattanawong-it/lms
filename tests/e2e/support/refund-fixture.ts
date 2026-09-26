import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, LessonType, Visibility } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `refund.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * ต่อ project: คอร์ส 750 บาท 2 คอร์ส — `inPolicy` คืนตามนโยบาย · `late` ทำให้เลย 7 วันเพื่อทดสอบคืนเป็นกรณีพิเศษ
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; title: string; instructorEmail: string; studentEmail: string };
export type RefundFixture = { inPolicy: string; late: string; studentId: string };
export type RefundState = {
  order: { id: string; status: string; refundReason: string | null; refundAmount: string | null; receiptNo: string | null } | null;
  enrollment: string | null;
  certificateRevoked: boolean | null;
  refundedAudits: number;
};

async function course(tag: string, title: string, instructorId: string) {
  const c = await db.course.create({
    data: {
      title,
      slug: `e2e-refund-${tag}`,
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
  return c.id;
}

const actions = {
  async setup(a: SetupArgs): Promise<RefundFixture> {
    const [instructor, student] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } }),
      db.user.findUniqueOrThrow({ where: { email: a.studentEmail } }),
    ]);
    return {
      inPolicy: await course(a.tag, `${a.title} ตามนโยบาย`, instructor.id),
      late: await course(`${a.tag}-late`, `${a.title} เลยกำหนด`, instructor.id),
      studentId: student.id,
    };
  },

  /** หลังซื้อ: ออกใบประกาศให้ (ทดสอบการเพิกถอน) · คอร์ส late ย้อนวันชำระไป 10 วัน */
  async afterPurchase(a: RefundFixture & { courseId: string; backdateDays: number }) {
    await db.certificate.create({ data: { code: `E2E-${a.courseId.slice(-10).toUpperCase()}`, userId: a.studentId, courseId: a.courseId } });
    if (a.backdateDays > 0) {
      await db.order.updateMany({
        where: { userId: a.studentId, courseId: a.courseId, status: "PAID" },
        data: { paidAt: new Date(Date.now() - a.backdateDays * 86_400_000) },
      });
    }
    return { ok: true };
  },

  async inspect(a: RefundFixture & { courseId: string }): Promise<RefundState> {
    const [order, enrollment, certificate] = await Promise.all([
      db.order.findFirst({
        where: { userId: a.studentId, courseId: a.courseId, status: { in: ["PAID", "REFUNDED"] } },
        select: { id: true, status: true, refundReason: true, refundAmount: true, receiptNo: true },
      }),
      db.enrollment.findUnique({ where: { userId_courseId: { userId: a.studentId, courseId: a.courseId } }, select: { status: true } }),
      db.certificate.findUnique({ where: { userId_courseId: { userId: a.studentId, courseId: a.courseId } }, select: { revokedAt: true } }),
    ]);
    const refundedAudits = order ? await db.auditLog.count({ where: { action: "order.refunded", entityId: order.id } }) : 0;
    return {
      order: order && { ...order, refundAmount: order.refundAmount?.toString() ?? null },
      enrollment: enrollment?.status ?? null,
      certificateRevoked: certificate ? certificate.revokedAt !== null : null,
      refundedAudits,
    };
  },

  async cleanup(f: RefundFixture) {
    const courseIds = [f.inPolicy, f.late];
    await db.certificate.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.order.deleteMany({ where: { courseId: { in: courseIds } } });
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
