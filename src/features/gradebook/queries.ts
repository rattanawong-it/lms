import "server-only";
import { db } from "@/lib/db";
import { assertCourseAccess } from "@/lib/rbac";
import { toScore } from "@/lib/decimal";
import { EnrollmentStatus, GradeSource, GradingMode } from "@/generated/prisma/enums";
import { parseCompletionRule } from "@/features/courses/schemas";
import { weightSum, weightedTotal } from "@/features/gradebook/lib/calc";
import { bandFor } from "@/features/gradebook/lib/curve";
import { resolveCourseCurve } from "@/features/score-curve/queries";
import { syncCourseGrades } from "@/features/gradebook/lib/sync";

/**
 * M09 · FR-09.1–09.4 — สมุดคะแนน
 * อ่านได้หลังซิงก์คะแนนอัตโนมัติจากต้นทาง (ไม่มี cron — แบบเดียวกับ closeIfOverdue ของ M07)
 */

/** ผู้เรียนที่อยู่ในสมุดคะแนน — ไม่รวมคำขอที่ยังไม่อนุมัติ/ถูกปฏิเสธ/ถอนตัว */
export const GRADEBOOK_STATUSES = [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED, EnrollmentStatus.EXPIRED];

const itemSelect = { id: true, title: true, source: true, maxScore: true, weight: true, position: true } as const;

function toItems(items: { id: string; title: string; source: GradeSource; maxScore: { toNumber(): number }; weight: { toNumber(): number } }[]) {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    source: i.source,
    maxScore: toScore(i.maxScore),
    weight: toScore(i.weight),
  }));
}

export type GradebookItem = ReturnType<typeof toItems>[number];

/** ตั้งค่าที่ใช้ร่วมกันระหว่างหน้าตารางและหน้าตั้งค่า */
async function loadCourse(courseId: string) {
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { id: true, title: true, gradeScale: true, departmentId: true, gradingMode: true, completionRule: true },
  });
  const resolved = await resolveCourseCurve(course);
  return {
    id: course.id,
    title: course.title,
    /** FR-09.8 — เกรด A–F หรือ S/U */
    mode: course.gradingMode,
    curve: resolved.curve,
    curveSource: resolved.source,
    /** เกณฑ์ชั้นบน (คณะ/ระบบ) — ค่าที่จะกลับไปใช้เมื่อผู้สอนเลิกตั้งทับ */
    inheritedSource: resolved.inherited.source,
    minScore: parseCompletionRule(course.completionRule).minScore,
  };
}

type LoadedCourse = Awaited<ReturnType<typeof loadCourse>>;

/** FR-09.8/09.9 — ผลของคะแนนรวมตามโหมดของคอร์ส (ตัดทศนิยมทิ้งก่อนเทียบช่วง) */
function resultOf(total: number | null, course: LoadedCourse): string | null {
  return bandFor(total, course.mode === GradingMode.PASS_FAIL ? course.curve.passFail : course.curve.grades);
}

/** FR-09.3 — ตารางผู้เรียน × รายการ */
export async function getGradebook(courseId: string) {
  await assertCourseAccess(courseId, "teach");
  await syncCourseGrades(courseId);

  const [course, items, enrollments] = await Promise.all([
    loadCourse(courseId),
    db.gradeItem.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: itemSelect }),
    db.enrollment.findMany({
      where: { courseId, status: { in: GRADEBOOK_STATUSES } },
      select: { user: { select: { id: true, name: true, email: true, externalId: true } } },
    }),
  ]);

  const grades = await db.grade.findMany({
    where: { gradeItemId: { in: items.map((i) => i.id) }, userId: { in: enrollments.map((e) => e.user.id) } },
    select: { gradeItemId: true, userId: true, score: true, overridden: true },
  });
  const byCell = new Map(grades.map((g) => [`${g.gradeItemId}:${g.userId}`, g]));

  const list = toItems(items);
  const rows = enrollments
    .map((e) => e.user)
    .sort((a, b) => a.name.localeCompare(b.name, "th"))
    .map((student) => {
      const cells = Object.fromEntries(
        list.map((item) => {
          const g = byCell.get(`${item.id}:${student.id}`);
          return [item.id, { score: toScore(g?.score ?? null), overridden: g?.overridden ?? false }];
        }),
      );
      const total = weightedTotal(list, new Map(list.map((i) => [i.id, cells[i.id]!.score])));
      return { student, cells, total, grade: resultOf(total, course) };
    });

  return { course, items: list, rows, weightTotal: weightSum(list.map((i) => i.weight)) };
}

export type Gradebook = Awaited<ReturnType<typeof getGradebook>>;

/** FR-09.1 / FR-09.2 — หน้าตั้งค่ารายการ น้ำหนัก และเกณฑ์ตัดเกรด */
export async function getGradebookSettings(courseId: string) {
  await assertCourseAccess(courseId, "teach");
  await syncCourseGrades(courseId);

  const [course, items] = await Promise.all([
    loadCourse(courseId),
    db.gradeItem.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: { ...itemSelect, _count: { select: { grades: { where: { score: { not: null } } } } } },
    }),
  ]);

  return {
    course,
    items: toItems(items).map((item, index) => ({ ...item, gradedCount: items[index]!._count.grades })),
    weightTotal: weightSum(items.map((i) => toScore(i.weight))),
  };
}

export type GradebookSettings = Awaited<ReturnType<typeof getGradebookSettings>>;

/** FR-09.4 — ผู้เรียนเห็นเฉพาะคะแนนของตัวเอง */
export async function getMyGrades(courseId: string) {
  const { user } = await assertCourseAccess(courseId, "learn");
  const enrolled = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { id: true },
  });
  const course = await loadCourse(courseId);
  if (!enrolled) return { course, enrolled: false as const };

  await syncCourseGrades(courseId, [user.id]);
  const items = await db.gradeItem.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: { ...itemSelect, grades: { where: { userId: user.id }, select: { score: true } } },
  });

  const list = toItems(items).map((item, index) => ({ ...item, score: toScore(items[index]!.grades[0]?.score ?? null) }));
  const total = weightedTotal(list, new Map(list.map((i) => [i.id, i.score])));
  return {
    course,
    enrolled: true as const,
    items: list,
    total,
    grade: resultOf(total, course),
    weightTotal: weightSum(list.map((i) => i.weight)),
  };
}
