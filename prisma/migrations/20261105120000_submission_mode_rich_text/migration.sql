-- CHANGELOG #53 — ช่องทางส่งงาน + ข้อความส่งงานแบบ rich text

-- CreateEnum
CREATE TYPE "SubmissionMode" AS ENUM ('TEXT', 'FILE', 'TEXT_OR_FILE');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "submissionMode" "SubmissionMode" NOT NULL DEFAULT 'TEXT_OR_FILE';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "content" JSONB;

-- ข้อความเดิม → Tiptap JSON ย่อหน้าละบรรทัด (แบบเดียวกับ plainTextToDoc() ใน lib/rich-text-doc.ts)
UPDATE "Submission" s
SET "content" = jsonb_build_object(
  'type', 'doc',
  'content', (
    SELECT jsonb_agg(
      CASE WHEN btrim(line) = '' THEN jsonb_build_object('type', 'paragraph')
      ELSE jsonb_build_object('type', 'paragraph', 'content',
        jsonb_build_array(jsonb_build_object('type', 'text', 'text', btrim(line))))
      END ORDER BY ord)
    FROM unnest(string_to_array(replace(replace(s."text", E'\r\n', E'\n'), E'\r', E'\n'), E'\n')) WITH ORDINALITY AS t(line, ord)
  )
)
WHERE s."text" IS NOT NULL AND btrim(s."text") <> '';

-- AlterTable
ALTER TABLE "Submission" DROP COLUMN "text";
