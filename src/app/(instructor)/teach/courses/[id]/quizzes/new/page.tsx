import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { QuizEditor } from "@/features/quiz/components/quiz-editor";
import { getQuizEditor } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "สร้างแบบทดสอบ" };

/** M07 · FR-07.3 — สร้างแบบทดสอบ */
export default async function NewQuizPage(props: PageProps<"/teach/courses/[id]/quizzes/new">) {
  const { id } = await props.params;
  const data = await getQuizEditor(id, null);

  return (
    <>
      <PageHeader title="สร้างแบบทดสอบ" description={data.course.title} />
      <QuizEditor data={data} />
    </>
  );
}
