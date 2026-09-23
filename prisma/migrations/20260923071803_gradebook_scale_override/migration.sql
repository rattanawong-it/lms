-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "gradeScale" JSONB;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "overridden" BOOLEAN NOT NULL DEFAULT false;
