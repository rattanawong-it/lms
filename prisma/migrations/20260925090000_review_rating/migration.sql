-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "ratingAvg" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Review_courseId_isHidden_idx" ON "Review"("courseId", "isHidden");


-- FR-14.1 ดาว 1–5 (schema เขียนไว้แต่ migration เดิมยังไม่มี)
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- ค่าเฉลี่ยของรีวิวที่มีอยู่ก่อน
UPDATE "Course" c SET
  "ratingCount" = s.cnt,
  "ratingAvg" = s.avg
FROM (
  SELECT "courseId", COUNT(*)::int AS cnt, ROUND(AVG("rating")::numeric, 2) AS avg
  FROM "Review" WHERE "isHidden" = false GROUP BY "courseId"
) s
WHERE s."courseId" = c."id";
