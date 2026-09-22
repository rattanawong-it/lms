import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import {
  AssetKind,
  AssetStatus,
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

/**
 * ไฟล์ตัวอย่างของบทเรียน (M05)
 *
 * ต่อ storage ตรงด้วย client ของตัวเองเหมือน `scripts/storage-init.ts`
 * เพราะ `src/lib/storage.ts` เป็น server-only ของ Next จึง import จากสคริปต์ Node ไม่ได้
 */
const BUCKET = process.env.S3_BUCKET ?? "lms";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

/**
 * PDF ขนาดเล็กที่เปิดได้จริง — ประกอบเองเพื่อไม่ต้องเก็บไฟล์ไบนารีไว้ในรีโป
 * ตาราง xref ต้องชี้ตำแหน่งไบต์ของแต่ละ object จึงคำนวณระหว่างต่อไฟล์
 */
function buildSamplePdf(): Buffer {
  const lf = "\n";
  const text = "Krirk LMS - sample lesson document";
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    [`<< /Length ${stream.length} >>`, "stream", stream, "endstream"].join(lf),
  ];

  let pdf = `%PDF-1.4${lf}`;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj${lf}${body}${lf}endobj${lf}`;
  });

  const xrefAt = pdf.length;
  pdf += `xref${lf}0 ${objects.length + 1}${lf}0000000000 65535 f ${lf}`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n ${lf}`;
  pdf += `trailer${lf}<< /Size ${objects.length + 1} /Root 1 0 R >>${lf}`;
  pdf += `startxref${lf}${xrefAt}${lf}%%EOF${lf}`;

  return Buffer.from(pdf, "latin1");
}

/**
 * MP4 ขนาดจิ๋วสำหรับทดสอบเส้นทาง "วิดีโออัปโหลด" (FR-05.2 · FR-15.7)
 *
 * มีแค่กล่อง `ftyp` และ `mdat` เปล่า ๆ — พอให้ผ่านการตรวจ magic bytes และให้ชุดเทสต์
 * พิสูจน์ได้ว่า signed URL ออกถูกต้อง แต่ **เล่นจริงไม่ได้** เพราะไม่มี track อยู่ข้างใน
 * ถ้าต้องการไฟล์ที่เล่นได้จริงให้ผู้สอนอัปโหลดเองผ่านหน้าจัดสารบัญ
 */
function buildSampleMp4(): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.byteLength + 8, 0);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, payload]);
  };

  const ftyp = box(
    "ftyp",
    Buffer.concat([
      Buffer.from("isom", "ascii"),
      Buffer.from([0, 0, 2, 0]), // minor version
      Buffer.from("isomiso2mp41", "ascii"), // compatible brands
    ]),
  );

  return Buffer.concat([ftyp, box("mdat", Buffer.alloc(0))]);
}

/** อัปโหลดไฟล์ตัวอย่างแล้วบันทึกเป็น Asset — คืน null เมื่อ storage ยังไม่พร้อม */
async function ensureSampleAsset(input: {
  key: string;
  kind: AssetKind;
  mime: string;
  originalName: string;
  body: Buffer;
  uploadedById: string;
}): Promise<{ id: string } | null> {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.mime,
      }),
    );
  } catch {
    return null;
  }

  return db.asset.upsert({
    where: { key: input.key },
    update: { status: AssetStatus.READY, size: BigInt(input.body.byteLength) },
    create: {
      key: input.key,
      kind: input.kind,
      mime: input.mime,
      size: BigInt(input.body.byteLength),
      originalName: input.originalName,
      status: AssetStatus.READY,
      uploadedById: input.uploadedById,
    },
    select: { id: true },
  });
}

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

  // ── บทเรียนตัวอย่างครบทั้ง 6 ชนิด (M05) ──
  // ไฟล์จริงของบทเรียน PDF และไฟล์ประกอบถูกอัปโหลดเข้า storage ด้วย
  // ถ้า MinIO ยังไม่ขึ้น seed จะข้ามสองชนิดนี้ไปแทนที่จะพัง
  const pdfAsset = await ensureSampleAsset({
    key: "pdf/seed/sample-document.pdf",
    kind: AssetKind.PDF,
    mime: "application/pdf",
    originalName: "เอกสารประกอบบทเรียน.pdf",
    body: buildSamplePdf(),
    uploadedById: instructor.id,
  });

  const videoAsset = await ensureSampleAsset({
    key: "video/seed/sample-lesson.mp4",
    kind: AssetKind.VIDEO,
    mime: "video/mp4",
    originalName: "วิดีโอตัวอย่าง.mp4",
    body: buildSampleMp4(),
    uploadedById: instructor.id,
  });

  const worksheetAsset = await ensureSampleAsset({
    key: "file/seed/sample-worksheet.txt",
    kind: AssetKind.FILE,
    mime: "text/plain",
    originalName: "ใบงานประจำบท.txt",
    body: Buffer.from("ใบงานตัวอย่างของ KRIRK LMS", "utf8"),
    uploadedById: instructor.id,
  });

  const section =
    (await db.section.findFirst({
      where: { courseId: course.id, position: 1 },
      select: { id: true },
    })) ??
    (await db.section.create({
      data: { courseId: course.id, title: "บทนำ", position: 1 },
      select: { id: true },
    }));

  /** สร้างบทเรียนเฉพาะที่ยังไม่มี — seed จึงรันซ้ำได้และเพิ่มชนิดใหม่ให้ฐานข้อมูลเดิมได้ด้วย */
  async function ensureLesson(
    title: string,
    data: Omit<Prisma.LessonUncheckedCreateInput, "sectionId" | "title">,
  ) {
    const existing = await db.lesson.findFirst({
      where: { sectionId: section.id, title },
      select: { id: true },
    });
    if (existing) return existing;
    return db.lesson.create({
      data: { ...data, sectionId: section.id, title },
      select: { id: true },
    });
  }

  const textLesson = await ensureLesson("ระบบนี้ใช้ทำอะไรได้บ้าง", {
    type: LessonType.TEXT,
    position: 1,
    isPreview: true,
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "สิ่งที่คุณจะได้จากคอร์สนี้" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "บทเรียนตัวอย่างสำหรับตรวจการแสดงผลเนื้อหาแบบ " },
            { type: "text", marks: [{ type: "bold" }], text: "ข้อความจัดรูปแบบ" },
            { type: "text", text: " ทั้งรายการ ตาราง และโค้ด" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "ค้นหาและลงทะเบียนคอร์ส" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "ติดตามความคืบหน้าของตนเอง" }] },
              ],
            },
          ],
        },
      ],
    },
  });

  await ensureLesson("วิดีโอแนะนำการใช้งาน", {
    type: LessonType.VIDEO,
    position: 2,
    videoSource: VideoSource.YOUTUBE,
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    durationSec: 213,
  });

  if (videoAsset) {
    await ensureLesson("วิดีโออัปโหลด (ไฟล์ตัวอย่าง เล่นจริงไม่ได้)", {
      type: LessonType.VIDEO,
      position: 3,
      videoSource: VideoSource.UPLOAD,
      assetId: videoAsset.id,
      durationSec: 30,
    });
  }

  if (pdfAsset) {
    await ensureLesson("เอกสารประกอบการเรียน", {
      type: LessonType.PDF,
      position: 4,
      assetId: pdfAsset.id,
    });
  }

  await ensureLesson("คาบถาม-ตอบสด", {
    type: LessonType.LIVE,
    position: 5,
    liveUrl: "https://meet.google.com/abc-defg-hij",
    liveStartAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    liveEndAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  });

  // สองชนิดนี้ยังไม่มีเนื้อหาของตัวเองจนกว่าจะถึง M07/M08 (เฟส 2)
  await ensureLesson("แบบทดสอบท้ายบท", { type: LessonType.QUIZ, position: 6 });
  await ensureLesson("งานที่ต้องส่ง", { type: LessonType.ASSIGNMENT, position: 7 });

  if (worksheetAsset) {
    const attached = await db.lessonAttachment.findFirst({
      where: { lessonId: textLesson.id, assetId: worksheetAsset.id },
      select: { id: true },
    });
    if (!attached) {
      await db.lessonAttachment.create({
        data: { lessonId: textLesson.id, assetId: worksheetAsset.id, downloadable: true },
      });
    }
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
