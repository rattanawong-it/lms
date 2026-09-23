import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { QuizEditor } from "@/features/quiz/components/quiz-editor";
import { getQuizEditor } from "@/features/quiz/queries";

export const metadata: Metadata = { title: "ตั้งค่าแบบทดสอบ" };

/** M07 · FR-07.3 — ตั้งค่าแบบทดสอบ */
export default async function EditQuizPage(props: PageProps<"/teach/courses/[id]/quizzes/[quizId]">) {
  const { id, quizId } = await props.params;
  const data = await getQuizEditor(id, quizId);

  return (
    <>
      <PageHeader title={data.quiz?.title ?? "ตั้งค่าแบบทดสอบ"} description={data.course.title} />
      <QuizEditor data={data} />
    </>
  );
}
