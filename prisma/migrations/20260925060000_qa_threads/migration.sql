-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Post_threadId_createdAt_idx" ON "Post"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Thread_courseId_lastPostAt_idx" ON "Thread"("courseId", "lastPostAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- กระทู้ที่มีอยู่ก่อน: ความเคลื่อนไหวล่าสุด = คำตอบล่าสุดหรือเวลาตั้ง
UPDATE "Thread" t SET "lastPostAt" = COALESCE((SELECT MAX(p."createdAt") FROM "Post" p WHERE p."threadId" = t."id"), t."createdAt");
