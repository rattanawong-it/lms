import "server-only";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";
import { isAtLeast, type SessionUser } from "@/lib/roles";
import { CourseStatus, EnrollPolicy, Role, Visibility } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { mediaSrc } from "@/lib/rich-text-doc";
import { CATALOG_PAGE_SIZE, type CatalogParams } from "@/features/catalog/schemas";

/**
 * M03 — คลังคอร์สและหน้ารายละเอียด
 *
 * FR-03.4 การมองเห็น:
 *   ผู้เยี่ยมชมที่ยังไม่ล็อกอิน  → เห็นเฉพาะคอร์ส PUBLIC
 *   ผู้ใช้ที่ล็อกอินแล้ว        → เห็นทั้ง PUBLIC และ INTERNAL (ภายในสถาบัน)
 * และทุกกรณีเห็นเฉพาะคอร์สที่ PUBLISHED แล้วเท่านั้น
 */
function visibilityFor(viewer: SessionUser | null): Visibility[] {
  return viewer ? [Visibility.PUBLIC, Visibility.INTERNAL] : [Visibility.PUBLIC];
}

function catalogWhere(viewer: SessionUser | null, params: CatalogParams): Prisma.CourseWhereInput {
  return {
    status: CourseStatus.PUBLISHED,
    visibility: { in: visibilityFor(viewer) },
    ...(params.category ? { category: { slug: params.category } } : {}),
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(params.level ? { level: params.level } : {}),
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: "insensitive" as const } },
            { summary: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string | null;
  coverKey: string | null;
  /** URL ของภาพปกที่หน้าเว็บใช้ได้ตรง ๆ — ดูรายละเอียดที่ `withCovers()` */
  coverUrl: string | null;
  categoryName: string | null;
  departmentName: string | null;
  instructorNames: string[];
  lessonCount: number;
  enrollmentCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  publishedAt: Date | null;
};

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  level: true,
  coverKey: true,
  publishedAt: true,
  // FR-14.2 — ค่าที่เก็บไว้บนคอร์ส (features/reviews คำนวณใหม่ทุกครั้งที่รีวิวเปลี่ยน)
  ratingAvg: true,
  ratingCount: true,
  category: { select: { name: true } },
  department: { select: { name: true } },
  instructors: { select: { user: { select: { name: true } } } },
  sections: { select: { _count: { select: { lessons: true } } } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseSelect;

type CourseCardRow = Prisma.CourseGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CourseCardRow): CourseCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    level: row.level,
    coverKey: row.coverKey,
    coverUrl: null,
    categoryName: row.category?.name ?? null,
    departmentName: row.department?.name ?? null,
    instructorNames: row.instructors.map((i) => i.user.name),
    lessonCount: row.sections.reduce((sum, s) => sum + s._count.lessons, 0),
    enrollmentCount: row._count.enrollments,
    ratingAvg: row.ratingCount > 0 && row.ratingAvg !== null ? Number(row.ratingAvg) : null,
    ratingCount: row.ratingCount,
    publishedAt: row.publishedAt,
  };
}

/**
 * เติม URL ของภาพปกให้การ์ดที่มี coverKey (คอร์สที่ยังไม่ตั้งปกได้ null แล้วไปแสดง placeholder)
 *
 * ชี้ไปที่ `/api/media/<assetId>` ไม่ใช่ signed URL ของ storage โดยตรง เพราะลายเซ็นเปลี่ยนทุกครั้ง
 * ที่ render ทำให้ทั้งเบราว์เซอร์และ image optimizer แคชไม่ได้เลย (ดู `app/api/media/[assetId]/route.ts`)
 * ปกทั้งหน้าใช้คิวรีเดียว — ไม่ใช่ไล่ถาม storage ทีละใบ
 */
async function withCovers(cards: CourseCard[]): Promise<CourseCard[]> {
  const keys = cards.flatMap((card) => (card.coverKey ? [card.coverKey] : []));
  if (keys.length === 0) return cards;

  const assets = await db.asset.findMany({
    where: { key: { in: keys }, status: "READY" },
    select: { id: true, key: true },
  });
  const idByKey = new Map(assets.map((asset) => [asset.key, asset.id]));

  return cards.map((card) => {
    const assetId = card.coverKey ? idByKey.get(card.coverKey) : undefined;
    return assetId ? { ...card, coverUrl: mediaSrc(assetId) } : card;
  });
}

export type CatalogResult = {
  rows: CourseCard[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * FR-03.2 — รายการคอร์สพร้อมค้นหา กรอง เรียง และแบ่งหน้า
 *
 * เรียงตามคะแนนรีวิวด้วย `Course.ratingAvg` ที่เก็บไว้ (คอร์สที่ยังไม่มีรีวิวอยู่ท้าย)
 */
export async function listCourses(params: CatalogParams): Promise<CatalogResult> {
  const viewer = await getSessionUser();
  const where = catalogWhere(viewer, params);
  const skip = (params.page - 1) * CATALOG_PAGE_SIZE;

  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    params.sort === "popular"
      ? [{ enrollments: { _count: "desc" } }, { publishedAt: "desc" }]
      : params.sort === "rating"
        ? [{ ratingAvg: { sort: "desc", nulls: "last" } }, { ratingCount: "desc" }, { publishedAt: "desc" }]
        : [{ publishedAt: "desc" }, { createdAt: "desc" }];

  const [rows, total] = await Promise.all([
    db.course.findMany({ where, orderBy, skip, take: CATALOG_PAGE_SIZE, select: cardSelect }),
    db.course.count({ where }),
  ]);

  return {
    rows: await withCovers(rows.map(toCard)),
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
  };
}

export type CatalogFilterOptions = {
  categories: { slug: string; name: string }[];
  departments: { id: string; name: string }[];
  levels: string[];
};

/**
 * ตัวเลือกของตัวกรอง — แสดงเฉพาะค่าที่มีคอร์สที่ผู้ใช้คนนี้เห็นได้จริง
 * จะได้ไม่มีตัวกรองที่กดแล้วเจอหน้าว่างเปล่า
 */
export async function catalogFilterOptions(): Promise<CatalogFilterOptions> {
  const viewer = await getSessionUser();
  const base = {
    status: CourseStatus.PUBLISHED,
    visibility: { in: visibilityFor(viewer) },
  } satisfies Prisma.CourseWhereInput;

  const [categories, departments, levels] = await Promise.all([
    db.category.findMany({
      where: { courses: { some: base } },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
    db.department.findMany({
      where: { courses: { some: base } },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
    db.course.findMany({
      where: { ...base, level: { not: null } },
      distinct: ["level"],
      orderBy: { level: "asc" },
      select: { level: true },
    }),
  ]);

  return {
    categories,
    departments,
    levels: levels.flatMap((l) => (l.level ? [l.level] : [])),
  };
}

export type CourseDetail = CourseCard & {
  description: unknown;
  enrollPolicy: EnrollPolicy;
  sequential: boolean;
  /** ผู้ดูคนนี้เป็นผู้สอนหรือผู้ดูแลของคอร์ส — เข้าหน้าเรียนได้โดยไม่ต้องลงทะเบียน (M06) */
  viewerCanTeach: boolean;
  visibility: Visibility;
  status: CourseStatus;
  sections: {
    id: string;
    title: string;
    lessons: { id: string; title: string; type: string; isPreview: boolean; durationSec: number | null }[];
  }[];
  /** ใช้ตัดสินสิทธิ์ผู้ดูแลของส่วนรีวิว (features/reviews) */
  departmentId: string | null;
};

/**
 * FR-03.3 — รายละเอียดคอร์ส
 *
 * คอร์สที่ยังไม่ PUBLISHED เปิดให้ดูได้เฉพาะผู้สอนของคอร์สนั้นและผู้ดูแล
 * เพื่อให้ตรวจงานก่อนเผยแพร่ได้ (FR-04.6) คนอื่นจะได้ null แล้วหน้าเรียก notFound()
 */
export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  const viewer = await getSessionUser();

  const course = await db.course.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      description: true,
      enrollPolicy: true,
      sequential: true,
      visibility: true,
      status: true,
      departmentId: true,
      instructors: { select: { userId: true, user: { select: { name: true } } } },
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          _count: { select: { lessons: true } },
          lessons: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, type: true, isPreview: true, durationSec: true },
          },
        },
      },
    },
  });

  if (!course) return null;

  const isOwnInstructor = viewer
    ? course.instructors.some((i) => i.userId === viewer.id)
    : false;
  const isManager = viewer
    ? viewer.role === Role.SUPER_ADMIN ||
      (viewer.role === Role.DEPT_ADMIN && viewer.departmentId === course.departmentId)
    : false;
  const canPreviewDraft = isOwnInstructor || isManager;

  if (course.status !== CourseStatus.PUBLISHED && !canPreviewDraft) return null;
  if (course.visibility === Visibility.INTERNAL && !viewer) return null;

  const [card] = await withCovers([toCard(course)]);

  return {
    ...card!,
    description: course.description,
    enrollPolicy: course.enrollPolicy,
    sequential: course.sequential,
    viewerCanTeach: canPreviewDraft,
    visibility: course.visibility,
    status: course.status,
    sections: course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons,
    })),
    departmentId: course.departmentId,
  };
}

/**
 * ใช้ใน generateMetadata (FR-03.5) — ดึงเฉพาะที่ต้องใช้ทำ meta tag
 *
 * ต้องใช้กติกาการมองเห็นชุดเดียวกับตัวหน้า มิฉะนั้น <title> และ og:title
 * จะบอกชื่อคอร์สภายในให้คนที่ยังไม่ล็อกอินรู้ ทั้งที่เปิดดูเนื้อหาไม่ได้
 */
export async function getCourseMeta(
  slug: string,
): Promise<{ title: string; summary: string | null; visibility: Visibility } | null> {
  const viewer = await getSessionUser();

  return db.course.findFirst({
    where: {
      slug,
      status: CourseStatus.PUBLISHED,
      visibility: { in: visibilityFor(viewer) },
    },
    select: { title: true, summary: true, visibility: true },
  });
}

/** ผู้ใช้คนนี้มีสิทธิ์ในระดับผู้สอนขึ้นไปหรือไม่ — ใช้ตัดสินปุ่มบนหน้า catalog */
export async function viewerIsStaff(): Promise<boolean> {
  const viewer = await getSessionUser();
  return viewer ? isAtLeast(viewer, Role.INSTRUCTOR) : false;
}
