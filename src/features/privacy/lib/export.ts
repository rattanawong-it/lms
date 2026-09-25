import "server-only";
import { db } from "@/lib/db";
import { toScore } from "@/lib/decimal";

/**
 * FR-17.4 — ข้อมูลส่วนบุคคลของผู้ใช้หนึ่งคนเป็น JSON (PDPA สิทธิ์ขอรับสำเนาข้อมูล)
 *
 * รับ `userId` จาก session เท่านั้น (ผู้เรียกคือ `/api/privacy/export`) — ไม่มีทางส่ง id ของคนอื่นเข้ามา
 * ทุก query กรองด้วย userId ของเจ้าของตรง ๆ · ไม่รวมคำตอบที่ถูกของข้อสอบ ชื่อ/อีเมลของผู้อื่น หรือ object key ใน storage
 */
export async function buildPersonalDataExport(userId: string) {
  const [
    profile,
    enrollments,
    attempts,
    submissions,
    grades,
    certificates,
    threads,
    posts,
    reviews,
    notifications,
    lineLink,
    orders,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        phone: true,
        externalId: true,
        department: { select: { code: true, name: true } },
        notifyPrefs: true,
        pdpaConsentAt: true,
        createdAt: true,
        accounts: { select: { providerId: true, createdAt: true } },
        sessions: { select: { ipAddress: true, userAgent: true, createdAt: true, expiresAt: true } },
      },
    }),
    db.enrollment.findMany({
      where: { userId },
      orderBy: { enrolledAt: "asc" },
      select: {
        status: true,
        source: true,
        progressPct: true,
        enrolledAt: true,
        completedAt: true,
        expiresAt: true,
        course: { select: { title: true } },
        progress: {
          select: { completed: true, completedAt: true, lastPositionSec: true, lesson: { select: { title: true } } },
        },
      },
    }),
    db.quizAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "asc" },
      select: {
        attemptNo: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        passed: true,
        quiz: { select: { title: true, course: { select: { title: true } } } },
      },
    }),
    db.submission.findMany({
      where: { userId },
      orderBy: { submittedAt: "asc" },
      select: {
        attemptNo: true,
        text: true,
        isLate: true,
        status: true,
        score: true,
        feedback: true,
        submittedAt: true,
        gradedAt: true,
        assignment: { select: { title: true, course: { select: { title: true } } } },
        files: { select: { asset: { select: { originalName: true, mime: true, size: true } } } },
      },
    }),
    db.grade.findMany({
      where: { userId },
      select: {
        score: true,
        updatedAt: true,
        gradeItem: { select: { title: true, maxScore: true, course: { select: { title: true } } } },
      },
    }),
    db.certificate.findMany({
      where: { userId },
      select: { code: true, issuedAt: true, revokedAt: true, course: { select: { title: true } } },
    }),
    db.thread.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      select: { title: true, body: true, createdAt: true, editedAt: true, course: { select: { title: true } } },
    }),
    db.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      select: { body: true, createdAt: true, editedAt: true, thread: { select: { title: true } } },
    }),
    db.review.findMany({
      where: { userId },
      select: { rating: true, comment: true, createdAt: true, updatedAt: true, course: { select: { title: true } } },
    }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.lineLink.findUnique({ where: { userId }, select: { linkedAt: true } }),
    // M18 — คำสั่งซื้อ (ไม่มีรหัสอ้างอิงของผู้ให้บริการ — เป็นข้อมูลภายในของ gateway)
    db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        subtotal: true,
        discount: true,
        amount: true,
        currency: true,
        couponCode: true,
        status: true,
        method: true,
        createdAt: true,
        paidAt: true,
        refundedAt: true,
        refundAmount: true,
        receiptNo: true,
        billing: true,
        course: { select: { title: true } },
      },
    }),
  ]);

  const { accounts, sessions, department, ...rest } = profile;

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      ...rest,
      department,
      signInMethods: accounts.map((a) => ({ provider: a.providerId, since: a.createdAt })),
      lineLinkedAt: lineLink?.linkedAt ?? null,
    },
    sessions,
    enrollments: enrollments.map(({ course, progress, ...e }) => ({
      course: course.title,
      ...e,
      lessons: progress.map(({ lesson, ...p }) => ({ lesson: lesson.title, ...p })),
    })),
    quizAttempts: attempts.map(({ quiz, score, maxScore, ...a }) => ({
      course: quiz.course.title,
      quiz: quiz.title,
      ...a,
      score: toScore(score),
      maxScore: toScore(maxScore),
    })),
    submissions: submissions.map(({ assignment, files, score, ...s }) => ({
      course: assignment.course.title,
      assignment: assignment.title,
      ...s,
      score: toScore(score),
      // รายชื่อไฟล์เท่านั้น (phase-3-plan ขั้น 7) — ตัวไฟล์ดาวน์โหลดได้จากหน้างานของคอร์ส
      files: files.map((f) => ({ name: f.asset.originalName, mime: f.asset.mime, size: Number(f.asset.size) })),
    })),
    grades: grades.map((g) => ({
      course: g.gradeItem.course.title,
      item: g.gradeItem.title,
      score: toScore(g.score),
      maxScore: toScore(g.gradeItem.maxScore),
      updatedAt: g.updatedAt,
    })),
    certificates: certificates.map(({ course, ...c }) => ({ course: course.title, ...c })),
    qa: {
      threads: threads.map(({ course, ...t }) => ({ course: course.title, ...t })),
      posts: posts.map(({ thread, ...p }) => ({ thread: thread.title, ...p })),
    },
    reviews: reviews.map(({ course, ...r }) => ({ course: course.title, ...r })),
    notifications,
    orders: orders.map(({ course, subtotal, discount, amount, refundAmount, ...o }) => ({
      course: course.title,
      ...o,
      subtotal: subtotal.toString(),
      discount: discount.toString(),
      amount: amount.toString(),
      refundAmount: refundAmount?.toString() ?? null,
    })),
  };
}
