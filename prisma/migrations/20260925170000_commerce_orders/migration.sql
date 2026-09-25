-- M18 · S3 (CHANGELOG #38) — Coupon ได้ id แยกจาก code · เขียนให้รันได้แม้มีแถวอยู่แล้ว
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_pkey",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "id" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "validFrom" TIMESTAMP(3);
UPDATE "Coupon" SET "id" = 'cpn' || md5("code") WHERE "id" IS NULL;
ALTER TABLE "Coupon" ALTER COLUMN "id" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id");
UPDATE "Coupon" SET "code" = upper("code");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_discount_check" CHECK (
  ("percentOff" IS NOT NULL AND "amountOff" IS NULL AND "percentOff" BETWEEN 1 AND 100)
  OR ("amountOff" IS NOT NULL AND "percentOff" IS NULL AND "amountOff" > 0)
);

-- M18 · S1
ALTER TABLE "Order" ADD COLUMN     "billing" JSONB,
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'THB',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "receiptNo" TEXT,
ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ALTER COLUMN "updatedAt" DROP DEFAULT;
UPDATE "Order" SET "subtotal" = "amount" + "discount" WHERE "subtotal" = 0;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_eventId_key" ON "PaymentEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_receiptNo_key" ON "Order"("receiptNo");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_courseId_status_idx" ON "Order"("courseId", "status");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- M18 · S2 — คำสั่งซื้อ PENDING ได้ไม่เกิน 1 ต่อผู้ใช้ต่อคอร์ส (กันเปิดหลายแท็บแล้วจ่ายซ้ำ)
CREATE UNIQUE INDEX "Order_one_pending_per_course" ON "Order"("userId", "courseId") WHERE "status" = 'PENDING';

-- ยอดเงินติดลบต้องเข้า DB ไม่ได้
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_check" CHECK ("amount" >= 0 AND "discount" >= 0 AND "subtotal" >= 0);
