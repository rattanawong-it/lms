import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assertCourseAccess, requireUser } from "@/lib/rbac";
import { toScore } from "@/lib/decimal";
import { formatBytes } from "@/lib/upload-limits";
import { EnrollmentStatus, LessonType, SubmissionStatus } from "@/generated/prisma/enums";
import { getLessonAccess } from "@/features/enrollment/queries";
import { latestPerStudent, submitState } from "@/features/assignments/lib/rules";

/**
 * M08 · FR-08.1–08.5 — งานที่ต้องส่ง
 */

const studentSelect = { id: true, name: true, email: true, externalId: true } as const;

const fileSelect = { asset: { select: { id: true, originalName: true, size: true } } } as const;

function toFiles(files: { asset: { id: string; originalName: string; size: bigint } }[]) {
  return files.map((f) => ({
    assetId: f.asset.id,
    originalName: f.asset.originalName,
    sizeLabel: formatBytes(Number(f.asset.size)),
  }));
}

/* ─────────────────────────── ผู้สอน (FR-08.1) ─────────────────────────── */

export async function getCourseAssignments(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  const [course, assignments, submissions] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.assignment.findMany({
      where: { courseId },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        dueAt: true,
        allowLate: true,
        maxScore: true,
        lesson: { select: { title: true } },
      },
    }),
    db.submission.findMany({
      where: { assignment: { courseId } },
      select: { assignmentId: true, userId: true, attemptNo: true, status: true },
    }),
  ]);

  const byAssignment = new Map<string, typeof submissions>();
  for (const s of submissions) byAssignment.set(s.assignmentId, [...(byAssignment.get(s.assignmentId) ?? []), s]);

  const rows = assignments.map((a) => {
    const latest = latestPerStudent(byAssignment.get(a.id) ?? []);
    return {
      ...a,
      maxScore: toScore(a.maxScore),
      submitterCount: latest.length,
      pendingCount: latest.filter((s) => s.status === SubmissionStatus.SUBMITTED).length,
      submissionCount: byAssignment.get(a.id)?.length ?? 0,
    };
  });

  return { course, assignments: rows, pendingTotal: rows.reduce((sum, a) => sum + a.pendingCount, 0) };
}

/** ข้อมูลของหน้าตั้งค่างาน — `assignmentId = null` คือสร้างใหม่ */
export async function getAssignmentEditor(courseId: string, assignmentId: string | null) {
  await assertCourseAccess(courseId, "teach");

  const assignment = assignmentId
    ? await db.assignment.findFirst({
        where: { id: assignmentId, courseId },
        select: {
          id: true,
          title: true,
          lessonId: true,
          instructions: true,
          dueAt: true,
          allowLate: true,
          maxScore: true,
          allowedTypes: true,
          maxFileMb: true,
          _count: { select: { submissions: true } },
        },
      })
    : null;
  if (assignmentId && !assignment) notFound();

  const [course, lessons] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.lesson.findMany({
      where: { type: LessonType.ASSIGNMENT, section: { courseId } },
      orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
      select: { id: true, title: true, assignment: { select: { id: true } } },
    }),
  ]);

  return {
    course,
    assignment: assignment
      ? { ...assignment, maxScore: toScore(assignment.maxScore), submissionCount: assignment._count.submissions }
      : null,
    // บทชนิดงานที่ยังว่าง หรือเป็นของงานนี้เอง
    lessons: lessons
      .filter((l) => !l.assignment || l.assignment.id === assignmentId)
      .map((l) => ({ id: l.id, title: l.title })),
  };
}

export type AssignmentEditorData = Awaited<ReturnType<typeof getAssignmentEditor>>;

/** งานที่ส่งของงานหนึ่ง: ส่งล่าสุดของแต่ละคน + ประวัติ + รายชื่อคนที่ยังไม่ส่ง */
export async function getAssignmentSubmissions(courseId: string, assignmentId: string) {
  await assertCourseAccess(courseId, "teach");

  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, courseId },
    select: { id: true, title: true, dueAt: true, allowLate: true, maxScore: true, course: { select: { id: true, title: true } } },
  });
  if (!assignment) notFound();

  const [submissions, enrolled] = await Promise.all([
    db.submission.findMany({
      where: { assignmentId },
      orderBy: { attemptNo: "desc" },
      select: {
        id: true,
        userId: true,
        attemptNo: true,
        status: true,
        isLate: true,
        score: true,
        submittedAt: true,
        user: { select: studentSelect },
        _count: { select: { files: true } },
      },
    }),
    db.enrollment.findMany({
      where: { courseId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
      select: { user: { select: studentSelect } },
    }),
  ]);

  const latest = latestPerStudent(submissions)
    .map((s) => ({
      id: s.id,
      student: s.user,
      attemptNo: s.attemptNo,
      status: s.status,
      isLate: s.isLate,
      score: toScore(s.score),
      submittedAt: s.submittedAt,
      fileCount: s._count.files,
    }))
    // รอตรวจขึ้นก่อน แล้วเรียงตามชื่อ
    .sort(
      (a, b) =>
        Number(b.status === SubmissionStatus.SUBMITTED) - Number(a.status === SubmissionStatus.SUBMITTED) ||
        a.student.name.localeCompare(b.student.name, "th"),
    );

  const submitted = new Set(latest.map((s) => s.student.id));
  const missing = enrolled
    .map((e) => e.user)
    .filter((u) => !submitted.has(u.id))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return {
    assignment: { ...assignment, maxScore: toScore(assignment.maxScore) },
    latest,
    missing,
    summary: {
      submitted: latest.length,
      pending: latest.filter((s) => s.status === SubmissionStatus.SUBMITTED).length,
      late: latest.filter((s) => s.isLate).length,
      missing: missing.length,
    },
  };
}

export type AssignmentSubmissions = Awaited<ReturnType<typeof getAssignmentSubmissions>>;

/** งานที่ส่งหนึ่งครั้ง + ประวัติการส่งของคนเดียวกัน (FR-08.4) */
export async function getSubmissionReview(courseId: string, assignmentId: string, submissionId: string) {
  await assertCourseAccess(courseId, "teach");

  const submission = await db.submission.findFirst({
    where: { id: submissionId, assignmentId, assignment: { courseId } },
    select: {
      id: true,
      userId: true,
      attemptNo: true,
      text: true,
      isLate: true,
      status: true,
      score: true,
      feedback: true,
      submittedAt: true,
      gradedAt: true,
      returnedAt: true,
      user: { select: studentSelect },
      files: { select: fileSelect },
      assignment: {
        select: { id: true, title: true, dueAt: true, maxScore: true, instructions: true, course: { select: { id: true, title: true } } },
      },
    },
  });
  if (!submission) notFound();

  const history = await db.submission.findMany({
    where: { assignmentId, userId: submission.userId },
    orderBy: { attemptNo: "desc" },
    select: { id: true, attemptNo: true, status: true, isLate: true, submittedAt: true },
  });

  return {
    submission: {
      ...submission,
      score: toScore(submission.score),
      files: toFiles(submission.files),
      assignment: { ...submission.assignment, maxScore: toScore(submission.assignment.maxScore) },
    },
    history,
    // ตรวจได้เฉพาะครั้งล่าสุด — ครั้งก่อนเป็นประวัติ
    isLatest: history[0]?.id === submission.id,
  };
}

export type SubmissionReview = Awaited<ReturnType<typeof getSubmissionReview>>;

/** FR-08.5 — คิวงานรอตรวจทั้งคอร์ส (ส่งล่าสุดของแต่ละคนที่ยังไม่ตรวจ) ส่งก่อนตรวจก่อน */
export async function getAssignmentQueue(courseId: string) {
  await assertCourseAccess(courseId, "teach");

  const [course, submissions] = await Promise.all([
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    db.submission.findMany({
      where: { assignment: { courseId } },
      select: {
        id: true,
        assignmentId: true,
        userId: true,
        attemptNo: true,
        status: true,
        isLate: true,
        submittedAt: true,
        user: { select: studentSelect },
        assignment: { select: { id: true, title: true } },
      },
    }),
  ]);

  const groups = new Map<string, typeof submissions>();
  for (const s of submissions) groups.set(s.assignmentId, [...(groups.get(s.assignmentId) ?? []), s]);

  const queue = [...groups.values()]
    .flatMap((rows) => latestPerStudent(rows))
    .filter((s) => s.status === SubmissionStatus.SUBMITTED)
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .map((s) => ({
      id: s.id,
      attemptNo: s.attemptNo,
      isLate: s.isLate,
      submittedAt: s.submittedAt,
      student: s.user,
      assignment: s.assignment,
    }));

  return { course, queue };
}

/* ─────────────────────────── ผู้เรียน (FR-08.2 / FR-08.5) ─────────────────────────── */

/** การ์ดงานในหน้าเรียน — ผ่านด่าน `getLessonAccess()` เดียวกับสื่อบทเรียนทุกชนิด */
export async function getLessonAssignment(lessonId: string) {
  const access = await getLessonAccess(lessonId);
  if (!access) notFound();

  const assignment = await db.assignment.findUnique({
    where: { lessonId },
    select: {
      id: true,
      title: true,
      instructions: true,
      dueAt: true,
      allowLate: true,
      maxScore: true,
      allowedTypes: true,
      maxFileMb: true,
    },
  });
  if (!assignment) return null;

  const submissions = access.enrollmentId
    ? await db.submission.findMany({
        where: { assignmentId: assignment.id, userId: access.userId },
        orderBy: { attemptNo: "desc" },
        select: {
          id: true,
          attemptNo: true,
          text: true,
          isLate: true,
          status: true,
          score: true,
          feedback: true,
          submittedAt: true,
          gradedAt: true,
          returnedAt: true,
          files: { select: fileSelect },
        },
      })
    : [];

  const latest = submissions[0] ?? null;
  const state = submitState(assignment, latest, new Date());

  let blocked: string | null = null;
  if (!access.enrollmentId) blocked = "ผู้สอนและผู้ดูแลดูได้แต่ส่งงานไม่ได้";
  else if (!access.unlocked) blocked = "ต้องเรียนบทก่อนหน้าให้จบก่อน";
  else if (!state.canSubmit) blocked = state.reason;

  return {
    assignment: { ...assignment, maxScore: toScore(assignment.maxScore) },
    blocked,
    resubmit: state.canSubmit && state.resubmit,
    willBeLate: state.canSubmit && state.late && latest === null,
    submissions: submissions.map((s) => ({
      id: s.id,
      attemptNo: s.attemptNo,
      text: s.text,
      isLate: s.isLate,
      status: s.status,
      // คะแนนแสดงเมื่อตรวจแล้วเท่านั้น · ความเห็นแสดงทั้งตอนตรวจแล้วและตอนส่งกลับ
      score: s.status === SubmissionStatus.GRADED ? toScore(s.score) : null,
      feedback: s.status === SubmissionStatus.SUBMITTED ? null : s.feedback,
      submittedAt: s.submittedAt,
      gradedAt: s.gradedAt,
      returnedAt: s.returnedAt,
      files: toFiles(s.files),
    })),
  };
}

export type LessonAssignment = NonNullable<Awaited<ReturnType<typeof getLessonAssignment>>>;

/** FR-08.5 — งานใกล้ครบกำหนด/ถูกส่งกลับให้แก้ ของผู้เรียน (หน้าหลัก) */
export async function getMyDueAssignments(limit = 5) {
  const user = await requireUser();
  const now = new Date();

  const assignments = await db.assignment.findMany({
    where: {
      lessonId: { not: null },
      course: {
        enrollments: {
          some: {
            userId: user.id,
            status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      allowLate: true,
      lessonId: true,
      course: { select: { id: true, title: true } },
      submissions: {
        where: { userId: user.id },
        orderBy: { attemptNo: "desc" },
        take: 1,
        select: { status: true, isLate: true },
      },
    },
  });

  return assignments
    .map((a) => {
      const latest = a.submissions[0] ?? null;
      const state = submitState(a, latest, now);
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt,
        course: a.course,
        href: `/learn/${a.course.id}/${a.lessonId}`,
        returned: latest?.status === SubmissionStatus.RETURNED,
        overdue: state.canSubmit && state.late && latest === null,
        todo: state.canSubmit && (latest === null || latest.status === SubmissionStatus.RETURNED),
      };
    })
    .filter((a) => a.todo)
    // ส่งกลับให้แก้ขึ้นก่อน แล้วตามกำหนดส่ง (ไม่มีกำหนดไว้ท้าย)
    .sort(
      (a, b) =>
        Number(b.returned) - Number(a.returned) ||
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
    )
    .slice(0, limit);
}
