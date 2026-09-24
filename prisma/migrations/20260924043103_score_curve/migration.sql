-- CreateEnum
CREATE TYPE "GradingMode" AS ENUM ('LETTER', 'PASS_FAIL');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "gradingMode" "GradingMode" NOT NULL DEFAULT 'LETTER';

-- CreateTable
CREATE TABLE "ScoreCurve" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "grades" JSONB NOT NULL,
    "passFail" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreCurve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoreCurve_departmentId_key" ON "ScoreCurve"("departmentId");

-- AddForeignKey
ALTER TABLE "ScoreCurve" ADD CONSTRAINT "ScoreCurve_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- เกณฑ์ทั้งระบบ (departmentId IS NULL) มีได้แถวเดียว — unique ปกติของ Postgres ไม่นับ NULL ซ้ำ
CREATE UNIQUE INDEX "ScoreCurve_system_key" ON "ScoreCurve" ((1)) WHERE "departmentId" IS NULL;

-- Q6 เกณฑ์จริงของมหาวิทยาลัย (CHANGELOG #29) — ค่าตั้งต้นอยู่ใน DB ไม่ใช่ในโค้ดหน้าเว็บ
INSERT INTO "ScoreCurve" ("id", "departmentId", "grades", "passFail", "updatedAt") VALUES (
  'system_score_curve',
  NULL,
  '[{"label":"A","min":80,"max":100},{"label":"B+","min":75,"max":79},{"label":"B","min":70,"max":74},{"label":"C+","min":65,"max":69},{"label":"C","min":60,"max":64},{"label":"D+","min":55,"max":59},{"label":"D","min":50,"max":54},{"label":"F","min":0,"max":49}]',
  '[{"label":"S","min":50,"max":100},{"label":"U","min":0,"max":49}]',
  CURRENT_TIMESTAMP
);
