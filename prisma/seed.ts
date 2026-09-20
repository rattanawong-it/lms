import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  CourseStatus,
  EnrollPolicy,
  InstructorRole,
  LessonType,
  Role,
  VideoSource,
  Visibility,
} from "../src/generated/prisma/enums";

/**
 * Seed ตามแผน implement (system-design §12 ข้อ 2)
 * — Super Admin 1 บัญชี · คณะตัวอย่าง · หมวดหมู่ · คอร์สตัวอย่าง 1 คอร์ส
 * เขียนแบบ idempotent (upsert) จึงรันซ้ำได้โดยไม่สร้างข้อมูลซ้ำ
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@krirk.ac.th";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

/** สร้าง/อัปเดตผู้ใช้พร้อม credential account ของ Better Auth */
async function upsertUser(input: {
  email: string;
  name: string;
  role: Role;
  password: string;
  departmentId?: string | null;
  externalId?: string | null;
}) {
  const user = await db.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      departmentId: input.departmentId ?? null,
      externalId: input.externalId ?? null,
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      emailVerified: true,
      departmentId: input.departmentId ?? null,
      externalId: input.externalId ?? null,
      pdpaConsentAt: new Date(),
    },
  });

  const existing = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });

  if (!existing) {
    await db.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await hashPassword(input.password),
      },
    });
  }

  return user;
}

async function main() {
  // ── คณะ / หน่วยงานตัวอย่าง (M02) ──
  const departments = await Promise.all(
    [
      { code: "SCI", name: "คณะวิทยาศาสตร์และเทคโนโลยี" },
      { code: "BUS", name: "คณะบริหารธุรกิจ" },
      { code: "HR", name: "ฝ่ายทรัพยากรบุคคล" },
    ].map((d) =>
      db.department.upsert({ where: { code: d.code }, update: { name: d.name }, create: d }),
    ),
  );
  const [sci, bus, hr] = departments;

  // ── หมวดหมู่คอร์ส (M03) ──
  const categories = await Promise.all(
    [
      { slug: "it", name: "เทคโนโลยีสารสนเทศ" },
      { slug: "business", name: "บริหารธุรกิจ" },
      { slug: "general", name: "ทักษะทั่วไป" },
    ].map((c) =>
      db.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c }),
    ),
  );
  const [it, business, general] = categories;

  // ── บัญชีผู้ใช้ตั้งต้น ──
  const admin = await upsertUser({
    email: ADMIN_EMAIL,
    name: "ผู้ดูแลระบบสูงสุด",
    role: Role.SUPER_ADMIN,
    password: ADMIN_PASSWORD,
  });

  const instructor = await upsertUser({
    email: "instructor@krirk.ac.th",
    name: "อาจารย์ตัวอย่าง",
    role: Role.INSTRUCTOR,
    password: ADMIN_PASSWORD,
    departmentId: sci.id,
    externalId: "EMP-0001",
  });

  const student = await upsertUser({
    email: "student@krirk.ac.th",
    name: "นักศึกษาตัวอย่าง",
    role: Role.STUDENT,
    password: ADMIN_PASSWORD,
    departmentId: sci.id,
    externalId: "STD-6600001",
  });

  // ── คอร์สตัวอย่าง (M04) ──
  const course = await db.course.upsert({
    where: { slug: "intro-to-lms" },
    update: {},
    create: {
      slug: "intro-to-lms",
      title: "เริ่มต้นใช้งาน KRIRK LMS",
      summary: "แนะนำการใช้งานระบบสำหรับผู้เรียนและผู้สอน ใช้เป็นคอร์สตัวอย่างสำหรับการทดสอบระบบ",
      level: "เบื้องต้น",
      status: CourseStatus.PUBLISHED,
      visibility: Visibility.INTERNAL,
      enrollPolicy: EnrollPolicy.OPEN,
      departmentId: sci.id,
      categoryId: it.id,
      publishedAt: new Date(),
    },
  });

  await db.courseInstructor.upsert({
    where: { courseId_userId: { courseId: course.id, userId: instructor.id } },
    update: { role: InstructorRole.OWNER },
    create: { courseId: course.id, userId: instructor.id, role: InstructorRole.OWNER },
  });

  const hasSections = await db.section.count({ where: { courseId: course.id } });
  if (hasSections === 0) {
    await db.section.create({
      data: {
        courseId: course.id,
        title: "บทนำ",
        position: 1,
        lessons: {
          create: [
            {
              title: "ระบบนี้ใช้ทำอะไรได้บ้าง",
              type: LessonType.TEXT,
              position: 1,
              isPreview: true,
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "บทเรียนตัวอย่างสำหรับตรวจสอบการแสดงผลเนื้อหาแบบข้อความ",
                      },
                    ],
                  },
                ],
              },
            },
            {
              title: "วิดีโอแนะนำการใช้งาน",
              type: LessonType.VIDEO,
              position: 2,
              videoSource: VideoSource.YOUTUBE,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              durationSec: 213,
            },
          ],
        },
      },
    });
  }

  // ── คอร์สเพิ่มเติมสำหรับทดสอบตัวกรองของคลังคอร์ส (M03) ──
  const moreCourses = [
    {
      slug: "data-analysis-basics",
      title: "พื้นฐานการวิเคราะห์ข้อมูลด้วยสเปรดชีต",
      summary: "เริ่มจากการจัดระเบียบข้อมูล ไปจนถึงสร้างแดชบอร์ดสรุปผลที่อ่านง่าย",
      level: "เบื้องต้น",
      visibility: Visibility.PUBLIC,
      departmentId: sci.id,
      categoryId: it.id,
    },
    {
      slug: "digital-marketing",
      title: "การตลาดดิจิทัลสำหรับธุรกิจขนาดเล็ก",
      summary: "วางแผนคอนเทนต์ เลือกช่องทาง และวัดผลแคมเปญด้วยงบประมาณจำกัด",
      level: "ปานกลาง",
      visibility: Visibility.PUBLIC,
      departmentId: bus!.id,
      categoryId: business!.id,
    },
    {
      slug: "academic-writing",
      title: "การเขียนเชิงวิชาการและการอ้างอิง",
      summary: "โครงสร้างบทความวิจัย การอ้างอิงที่ถูกต้อง และการหลีกเลี่ยงการคัดลอกผลงาน",
      level: "ปานกลาง",
      visibility: Visibility.INTERNAL,
      departmentId: sci.id,
      categoryId: general!.id,
    },
    {
      slug: "workplace-safety",
      title: "ความปลอดภัยในที่ทำงานสำหรับบุคลากรใหม่",
      summary: "หลักสูตรบังคับสำหรับบุคลากรที่เพิ่งเริ่มงาน ใช้เวลาเรียนประมาณ 2 ชั่วโมง",
      level: "เบื้องต้น",
      visibility: Visibility.INTERNAL,
      departmentId: hr!.id,
      categoryId: general!.id,
    },
  ];

  for (const data of moreCourses) {
    const extraCourse = await db.course.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        status: CourseStatus.PUBLISHED,
        enrollPolicy: EnrollPolicy.OPEN,
        publishedAt: new Date(),
      },
    });

    await db.courseInstructor.upsert({
      where: { courseId_userId: { courseId: extraCourse.id, userId: instructor.id } },
      update: {},
      create: { courseId: extraCourse.id, userId: instructor.id, role: InstructorRole.OWNER },
    });

    const sectionCount = await db.section.count({ where: { courseId: extraCourse.id } });
    if (sectionCount === 0) {
      await db.section.create({
        data: {
          courseId: extraCourse.id,
          title: "บทนำ",
          position: 1,
          lessons: {
            create: [
              { title: "ภาพรวมของคอร์ส", type: LessonType.TEXT, position: 1, isPreview: true },
              { title: "สิ่งที่ต้องเตรียมก่อนเรียน", type: LessonType.TEXT, position: 2 },
            ],
          },
        },
      });
    }
  }

  console.log("seed เสร็จแล้ว:");
  console.log(`  คณะ/หน่วยงาน ${departments.length} รายการ · หมวดหมู่ ${categories.length} รายการ`);
  console.log(`  Super Admin : ${admin.email}`);
  console.log(`  ผู้สอน      : ${instructor.email}`);
  console.log(`  ผู้เรียน     : ${student.email}`);
  console.log(`  คอร์สตัวอย่าง: ${course.slug} และอีก ${moreCourses.length} คอร์ส`);
  console.log(`  รหัสผ่านเริ่มต้นทุกบัญชี: ${ADMIN_PASSWORD} (เปลี่ยนทันทีหลัง login ครั้งแรก)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
