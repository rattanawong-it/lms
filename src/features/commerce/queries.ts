import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/rbac";
import { hasPayment } from "@/lib/env";
import { CourseStatus, EnrollmentStatus, OrderStatus, Role, Visibility } from "@/generated/prisma/enums";
import { courseOffer, type CourseOffer } from "@/features/commerce/lib/pricing";
import { checkRefund, type RefundCheck } from "@/features/commerce/lib/refund-rules";
import { ORDER_PAGE_SIZE, type OrderFilter } from "@/features/commerce/schemas";
import { reportDateRange } from "@/features/reports/lib/report";
import type { Prisma } from "@/generated/prisma/client";

/** M18 · FR-18.1 — ข้อมูลหน้าชำระเงินและคำสั่งซื้อ (เจ้าของเท่านั้น — ตัวตนจาก session) */

export type CheckoutView = {
  course: { id: string; slug: string; title: string; summary: string | null };
  offer: CourseOffer;
  /** มีสิทธิ์เรียนอยู่แล้ว — ไม่ต้องซื้อ */
  alreadyEnrolled: boolean;
  /** คำสั่งซื้อที่ยังรอชำระ (กดซื้อซ้ำจะใช้อันนี้ต่อ) */
  pendingOrderId: string | null;
};

export async function getCheckout(courseId: string): Promise<CheckoutView> {
  const user = await requireUser(`/checkout/${courseId}`);
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, title: true, summary: true, status: true, visibility: true, price: true, enrollPolicy: true },
  });
  if (!course || course.status !== CourseStatus.PUBLISHED) notFound();

  const [enrollment, pending] = await Promise.all([
    db.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
      select: { status: true, expiresAt: true },
    }),
    db.order.findFirst({
      where: { userId: user.id, courseId, status: OrderStatus.PENDING, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  const alreadyEnrolled =
    !!enrollment &&
    (enrollment.status === EnrollmentStatus.ACTIVE || enrollment.status === EnrollmentStatus.COMPLETED) &&
    (enrollment.expiresAt === null || enrollment.expiresAt > new Date());

  return {
    course: { id: course.id, slug: course.slug, title: course.title, summary: course.summary },
    offer: courseOffer(course, hasPayment),
    alreadyEnrolled,
    pendingOrderId: pending?.id ?? null,
  };
}

export type OrderRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  amount: string;
  status: OrderStatus;
  method: string | null;
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
};

const orderSelect = {
  id: true,
  courseId: true,
  amount: true,
  status: true,
  method: true,
  createdAt: true,
  paidAt: true,
  expiresAt: true,
  course: { select: { title: true, slug: true } },
} as const;

type OrderSelected = {
  id: string;
  courseId: string;
  amount: { toString(): string };
  status: OrderStatus;
  method: string | null;
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
  course: { title: string; slug: string };
};

const toRow = (o: OrderSelected): OrderRow => ({
  id: o.id,
  courseId: o.courseId,
  courseTitle: o.course.title,
  courseSlug: o.course.slug,
  amount: o.amount.toString(),
  status: o.status,
  method: o.method,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
  expiresAt: o.expiresAt,
});

/** `/orders` — ประวัติของฉัน ใหม่สุดก่อน */
export async function listMyOrders(): Promise<OrderRow[]> {
  const user = await requireUser("/orders");
  const rows = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: orderSelect,
  });
  return rows.map(toRow);
}

/** `/orders/[id]` — ไม่ใช่ของตัวเอง = ไม่พบ (ไม่บอกว่ามีอยู่) */
export async function getMyOrder(
  orderId: string,
): Promise<
  OrderRow & { failureReason: string | null; subtotal: string; discount: string; couponCode: string | null; receiptNo: string | null; refundedAt: Date | null }
> {
  const user = await requireUser(`/orders/${orderId}`);
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: { ...orderSelect, failureReason: true, subtotal: true, discount: true, couponCode: true, receiptNo: true, refundedAt: true },
  });
  if (!order) notFound();
  return {
    ...toRow(order),
    failureReason: order.failureReason,
    subtotal: order.subtotal.toString(),
    discount: order.discount.toString(),
    couponCode: order.couponCode,
    receiptNo: order.receiptNo,
    refundedAt: order.refundedAt,
  };
}

export type CouponRow = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOff: string | null;
  maxUses: number | null;
  usedCount: number;
  /** คำสั่งซื้อที่รอชำระและจองคูปองนี้อยู่ */
  reserved: number;
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
  course: { id: string; title: string } | null;
  createdAt: Date;
  state: "active" | "inactive" | "scheduled" | "expired" | "exhausted";
};

/** `/admin/coupons` — FR-18.2 · Q3 ผู้ดูแลระบบเท่านั้น · ใหม่สุดก่อน */
export async function listCoupons(query: string): Promise<CouponRow[]> {
  await requireRole(Role.SUPER_ADMIN);
  const now = new Date();
  const rows = await db.coupon.findMany({
    where: query ? { code: { contains: query.trim().toUpperCase() } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      code: true,
      percentOff: true,
      amountOff: true,
      maxUses: true,
      usedCount: true,
      validFrom: true,
      validUntil: true,
      active: true,
      createdAt: true,
      course: { select: { id: true, title: true } },
      _count: { select: { orders: { where: { status: OrderStatus.PENDING, expiresAt: { gt: now } } } } },
    },
  });
  return rows.map(({ _count, amountOff, ...c }) => ({
    ...c,
    amountOff: amountOff?.toString() ?? null,
    reserved: _count.orders,
    state: !c.active
      ? "inactive"
      : c.validUntil && c.validUntil < now
        ? "expired"
        : c.maxUses !== null && c.usedCount >= c.maxUses
          ? "exhausted"
          : c.validFrom && c.validFrom > now
            ? "scheduled"
            : "active",
  }));
}

/** ตัวเลือกคอร์สในฟอร์มคูปอง — เฉพาะคอร์สสาธารณะที่ตั้งราคาแล้ว (คอร์สอื่นไม่มีอะไรให้ลด) */
export async function couponCourseOptions(): Promise<{ id: string; title: string }[]> {
  await requireRole(Role.SUPER_ADMIN);
  return db.course.findMany({
    where: { visibility: Visibility.PUBLIC, price: { gt: 0 }, status: { not: CourseStatus.ARCHIVED } },
    orderBy: { title: "asc" },
    take: 500,
    select: { id: true, title: true },
  });
}

export type AdminOrderRow = {
  id: string;
  createdAt: Date;
  paidAt: Date | null;
  status: OrderStatus;
  subtotal: string;
  discount: string;
  amount: string;
  couponCode: string | null;
  method: string | null;
  receiptNo: string | null;
  refundedAt: Date | null;
  refundReason: string | null;
  /** มีคำขอคืนเงินค้างรอผู้ให้บริการยืนยัน */
  refundPending: boolean;
  buyer: { name: string; email: string };
  course: { id: string; title: string };
  progressPct: number;
  refund: RefundCheck;
};

/** `/admin/orders` — FR-18.2 ค้นหา/กรองคำสั่งซื้อ + ผลตรวจนโยบายคืนเงิน (SUPER_ADMIN) */
export async function listAdminOrders(filter: OrderFilter) {
  await requireRole(Role.SUPER_ADMIN);
  const createdAt = reportDateRange(filter);
  const q = filter.q;
  const where: Prisma.OrderWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { receiptNo: { equals: q.toUpperCase() } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { course: { title: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filter.page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        courseId: true,
        createdAt: true,
        paidAt: true,
        status: true,
        subtotal: true,
        discount: true,
        amount: true,
        couponCode: true,
        method: true,
        receiptNo: true,
        providerRef: true,
        refundedAt: true,
        refundReason: true,
        user: { select: { name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  const enrollments = rows.length
    ? await db.enrollment.findMany({
        where: { OR: rows.map((r) => ({ userId: r.userId, courseId: r.courseId })) },
        select: { userId: true, courseId: true, progressPct: true },
      })
    : [];
  const progress = new Map(enrollments.map((e) => [`${e.userId}:${e.courseId}`, e.progressPct]));
  const now = new Date();

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    rows: rows.map((r): AdminOrderRow => {
      const progressPct = progress.get(`${r.userId}:${r.courseId}`) ?? 0;
      return {
        id: r.id,
        createdAt: r.createdAt,
        paidAt: r.paidAt,
        status: r.status,
        subtotal: r.subtotal.toString(),
        discount: r.discount.toString(),
        amount: r.amount.toString(),
        couponCode: r.couponCode,
        method: r.method,
        receiptNo: r.receiptNo,
        refundedAt: r.refundedAt,
        refundReason: r.refundReason,
        refundPending: r.status === OrderStatus.PAID && r.refundReason !== null,
        buyer: r.user,
        course: r.course,
        progressPct,
        refund: checkRefund(r, progressPct, now),
      };
    }),
  };
}
