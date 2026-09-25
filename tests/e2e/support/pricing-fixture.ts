import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { CourseStatus, EnrollPolicy, Visibility } from "../../../src/generated/prisma/enums";

config({ quiet: true });

/**
 * ข้อมูลตั้งต้นของ `pricing.spec.ts` — รันด้วย tsx แยก process (ดู `runFixture()` ใน helpers.ts)
 * คอร์สสาธารณะของ instructor 3 สถานะ: ร่าง (ผู้สอนตั้งราคาเองได้) · รออนุมัติ 1,290 บาท · เผยแพร่ 990 บาท (ล็อกราคา)
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type SetupArgs = { tag: string; instructorEmail: string };
export type PricingFixture = { draft: Course; pending: Course; published: Course };
type Course = { id: string; slug: string; title: string };

const actions = {
  async setup(a: SetupArgs): Promise<PricingFixture> {
    const instructor = await db.user.findUniqueOrThrow({ where: { email: a.instructorEmail } });
    const make = async (kind: string, status: CourseStatus, price: string | null): Promise<Course> => {
      const c = await db.course.create({
        data: {
          title: `คอร์สราคา ${kind} ${a.tag}`,
          slug: `e2e-price-${kind}-${a.tag}`,
          status,
          visibility: Visibility.PUBLIC,
          enrollPolicy: EnrollPolicy.OPEN,
          price,
          publishedAt: status === CourseStatus.PUBLISHED ? new Date() : null,
          departmentId: instructor.departmentId,
          instructors: { create: { userId: instructor.id } },
        },
      });
      return { id: c.id, slug: c.slug, title: c.title };
    };
    return {
      draft: await make("draft", CourseStatus.DRAFT, null),
      pending: await make("pending", CourseStatus.PENDING_REVIEW, "1290.00"),
      published: await make("published", CourseStatus.PUBLISHED, "990.00"),
    };
  },

  async cleanup(f: PricingFixture) {
    await db.course.deleteMany({ where: { id: { in: [f.draft.id, f.pending.id, f.published.id] } } });
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
