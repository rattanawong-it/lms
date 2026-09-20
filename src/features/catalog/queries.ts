import "server-only";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";
import { presignGet } from "@/lib/storage";
import { isAtLeast, type SessionUser } from "@/lib/roles";
import { CourseStatus, Role, Visibility } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
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
  /** signed URL ของภาพปก — ดูรายละเอียดที่ `withCovers()` */
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

type RatingStat = { avg: number; count: number };

/** คะแนนรีวิวเฉลี่ยของคอร์สตามรายการ id ที่ระบุ (ไม่นับรีวิวที่ถูกซ่อน) */
async function ratingsByCourse(courseIds: string[]): Promise<Map<string, RatingStat>> {
  if (courseIds.length === 0) return new Map();

  const rows = await db.review.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courseIds }, isHidden: false },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return new Map(
    rows.map((r) => [r.courseId, { avg: r._avg.rating ?? 0, count: r._count._all }]),
  );
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  level: true,
  coverKey: true,
  publishedAt: true,
  category: { select: { name: true } },
  department: { select: { name: true } },
  instructors: { select: { user: { select: { name: true } } } },
  sections: { select: { _count: { select: { lessons: true } } } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseSelect;

type CourseCardRow = Prisma.CourseGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CourseCardRow, rating: RatingStat | undefined): CourseCard {
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
    ratingAvg: rating && rating.count > 0 ? rating.avg : null,
    ratingCount: rating?.count ?? 0,
    publishedAt: row.publishedAt,
  };
}

/** อายุ signed URL ของภาพปก — ยาวกว่าเนื้อหาบทเรียนได้ เพราะปกเป็นภาพโปรโมต ไม่ใช่เนื้อหาที่ต้องป้องกันตาม M15 */
const COVER_URL_TTL_SECONDS = 60 * 60;

/** เติม signed URL ของภาพปกให้การ์ดที่มี coverKey (คอร์สที่ยังไม่ตั้งปกจะได้ null แล้วไปแสดง placeholder) */
async function withCovers(cards: CourseCard[]): Promise<CourseCard[]> {
  return Promise.all(
    cards.map(async (card) =>
      card.coverKey
        ? { ...card, coverUrl: await presignGet(card.coverKey, { expiresIn: COVER_URL_TTL_SECONDS }) }
        : card,
    ),
  );
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
 * การเรียงตาม "คะแนนรีวิว" ต้องใช้ค่าเฉลี่ยของตารางลูก ซึ่ง Prisma สั่ง orderBy ไม่ได้
 * จึงดึงเฉพาะ id ของคอร์สที่ตรงเงื่อนไขมาจัดอันดับในแอปแล้วค่อยแบ่งหน้า
 * วิธีนี้ยังคงใช้ where ชุดเดียวกับเส้นทางอื่น (ไม่มี SQL ซ้ำซ้อนให้หลุดกัน)
 * ถ้าจำนวนคอร์สโตจนวิธีนี้ช้า ค่อยพิจารณาเก็บ ratingAvg/ratingCount ไว้บน Course
 */
export async function listCourses(params: CatalogParams): Promise<CatalogResult> {
  const viewer = await getSessionUser();
  const where = catalogWhere(viewer, params);
  const skip = (params.page - 1) * CATALOG_PAGE_SIZE;

  if (params.sort === "rating") {
    const candidates = await db.course.findMany({ where, select: { id: true } });
    const ratings = await ratingsByCourse(candidates.map((c) => c.id));

    const ordered = candidates
      .map((c) => ({ id: c.id, stat: ratings.get(c.id) }))
      .sort((a, b) => {
        const scoreA = a.stat && a.stat.count > 0 ? a.stat.avg : -1;
        const scoreB = b.stat && b.stat.count > 0 ? b.stat.avg : -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (b.stat?.count ?? 0) - (a.stat?.count ?? 0);
      });

    const pageIds = ordered.slice(skip, skip + CATALOG_PAGE_SIZE).map((o) => o.id);
    const rows = await db.course.findMany({ where: { id: { in: pageIds } }, select: cardSelect });
    const byId = new Map(rows.map((r) => [r.id, r]));

    return {
      rows: await withCovers(
        pageIds.flatMap((id) => {
          const row = byId.get(id);
          return row ? [toCard(row, ratings.get(id))] : [];
        }),
      ),
      total: candidates.length,
      page: params.page,
      pageCount: Math.max(1, Math.ceil(candidates.length / CATALOG_PAGE_SIZE)),
    };
  }

  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    params.sort === "popular"
      ? [{ enrollments: { _count: "desc" } }, { publishedAt: "desc" }]
      : [{ publishedAt: "desc" }, { createdAt: "desc" }];

  const [rows, total] = await Promise.all([
    db.course.findMany({ where, orderBy, skip, take: CATALOG_PAGE_SIZE, select: cardSelect }),
    db.course.count({ where }),
  ]);

  const ratings = await ratingsByCourse(rows.map((r) => r.id));

  return {
    rows: await withCovers(rows.map((row) => toCard(row, ratings.get(row.id)))),
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
  enrollPolicy: string;
  sequential: boolean;
  visibility: Visibility;
  status: CourseStatus;
  sections: {
    id: string;
    title: string;
    lessons: { id: string; title: string; type: string; isPreview: boolean; durationSec: number | null }[];
  }[];
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    authorName: string;
  }[];
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
      reviews: {
        where: { isHidden: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { name: true } },
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

  const ratings = await ratingsByCourse([course.id]);
  const [card] = await withCovers([toCard(course, ratings.get(course.id))]);

  return {
    ...card!,
    description: course.description,
    enrollPolicy: course.enrollPolicy,
    sequential: course.sequential,
    visibility: course.visibility,
    status: course.status,
    sections: course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons,
    })),
    reviews: course.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      authorName: r.user.name,
    })),
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
