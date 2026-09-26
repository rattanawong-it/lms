import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollmentStatus } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `privacy.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * ผู้ใช้ชั่วคราว 2 คนที่ส่งคำขอลบบัญชีไว้แล้ว (อนุมัติ 1 · ปฏิเสธ 1) — ไม่ต้องล็อกอิน เพราะโควตาล็อกอินเต็มแล้ว (CLAUDE.md §6)
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; instructorEmail: string };
export type PrivacyFixture = {
  courseId: string;
  approve: { id: string; email: string; name: string; certCode: string };
  reject: { id: string; email: string; name: string };
};

/** รูปแบบเดียวกับ `CODE_PATTERN` — หน้า /verify ไม่ค้นรหัสที่ผิดรูปแบบ · ปี 9999 ไม่ชนกับใบจริง */
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const randomCode = () =>
  `LMS-9999-${Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("")}`;

const actions = {
  async setup(a: SetupArgs): Promise<PrivacyFixture> {
    const instructor = await db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } });
    const course = await db.course.create({
      data: {
        title: `คอร์ส PDPA ${a.tag}`,
        slug: `e2e-pdpa-${a.tag}`,
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
        instructors: { create: { userId: instructor.id } },
      },
    });
    const make = (kind: string) =>
      db.user.create({
        data: {
          name: `ผู้ขอลบ ${kind} ${a.tag}`,
          email: `pdpa-${kind}-${a.tag}@example.com`,
          emailVerified: true,
          phone: "0812345678",
          externalId: `S-${kind}-${a.tag}`,
          deletionRequestedAt: new Date(),
          deletionReason: `ย้ายสถาบัน ${kind}`,
          sessions: { create: { token: `tok-${kind}-${a.tag}`, expiresAt: new Date(Date.now() + 86_400_000) } },
          accounts: { create: { providerId: "credential", accountId: `pdpa-${kind}-${a.tag}`, password: "x" } },
        },
      });
    const [approve, reject] = [await make("approve"), await make("reject")];
    await db.enrollment.create({
      data: { userId: approve.id, courseId: course.id, status: EnrollmentStatus.COMPLETED, progressPct: 100, completedAt: new Date() },
    });
    const cert = await db.certificate.create({
      data: { code: randomCode(), userId: approve.id, courseId: course.id },
    });
    // M18 — คำสั่งซื้อที่มีใบเสร็จ: ต้องคงไว้ (เอกสารบัญชี) แต่อีเมลใน snapshot ถูกล้าง
    await db.order.create({
      data: {
        userId: approve.id,
        courseId: course.id,
        subtotal: "500.00",
        amount: "500.00",
        status: "PAID",
        paidAt: new Date(),
        receiptNo: `RC-E2E-${a.tag}`,
        billing: { seller: { name: "ผู้ขายทดสอบ", taxId: null, address: null, phone: null }, buyer: { name: approve.name, email: approve.email } },
      },
    });
    // log ที่ผู้สอนเขียนอีเมลของผู้ใช้ไว้ — ต้องถูกล้างเมื่อ anonymize
    await db.auditLog.create({
      data: { actorId: instructor.id, action: "course.addInstructor", entity: "Course", entityId: course.id, after: { email: approve.email } },
    });
    return {
      courseId: course.id,
      approve: { id: approve.id, email: approve.email, name: approve.name, certCode: cert.code },
      reject: { id: reject.id, email: reject.email, name: reject.name },
    };
  },

  async inspect(f: PrivacyFixture) {
    const [approved, rejected, sessions, accounts, mentions, order] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: f.approve.id },
        select: { name: true, email: true, phone: true, externalId: true, deletedAt: true, banned: true },
      }),
      db.user.findUniqueOrThrow({ where: { id: f.reject.id }, select: { deletionRequestedAt: true, deletedAt: true } }),
      db.session.count({ where: { userId: f.approve.id } }),
      db.account.count({ where: { userId: f.approve.id } }),
      db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "AuditLog" WHERE after::text ILIKE ${`%${f.approve.email}%`} OR before::text ILIKE ${`%${f.approve.email}%`}`,
      db.order.findFirst({ where: { userId: f.approve.id }, select: { receiptNo: true, billing: true } }),
    ]);
    return {
      approved: { ...approved, deletedAt: approved.deletedAt?.toISOString() ?? null },
      rejected: { requested: rejected.deletionRequestedAt !== null, deleted: rejected.deletedAt !== null },
      sessions,
      accounts,
      auditMentions: Number(mentions[0]!.n),
      order: order && { receiptNo: order.receiptNo, buyer: (order.billing as { buyer: { name: string; email: string } }).buyer },
    };
  },

  /** ผู้เรียนที่ใช้ร่วมกันทั้งชุดเทสต์ต้องไม่ค้างสถานะ "ขอลบบัญชี" */
  async resetStudent(a: { email: string }) {
    await db.user.update({ where: { email: a.email }, data: { deletionRequestedAt: null, deletionReason: null } });
    return { ok: true };
  },

  async cleanup(f: PrivacyFixture) {
    // ใบประกาศอ้างคอร์สแบบไม่ cascade — ลบก่อนคอร์ส
    await db.certificate.deleteMany({ where: { userId: { in: [f.approve.id, f.reject.id] } } });
    await db.order.deleteMany({ where: { courseId: f.courseId } });
    await db.course.deleteMany({ where: { id: f.courseId } });
    await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [f.approve.id, f.reject.id, f.courseId] } }, { actorId: { in: [f.approve.id, f.reject.id] } }] } });
    await db.user.deleteMany({ where: { id: { in: [f.approve.id, f.reject.id] } } });
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
