import type { Metadata } from "next";
import Link from "next/link";
import { ListTree, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { QuestionBank } from "@/features/questions/components/question-bank";
import { getQuestionBank } from "@/features/questions/queries";
import { questionFilterSchema } from "@/features/questions/schemas";

export const metadata: Metadata = { title: "คลังข้อสอบ" };

/** M07 · FR-07.1 / FR-07.2 / FR-07.7 — คลังข้อสอบของคอร์ส (CHANGELOG #20) */
export default async function QuestionBankPage(props: PageProps<"/teach/courses/[id]/questions">) {
  const { id } = await props.params;
  const filter = questionFilterSchema.parse(await props.searchParams);
  const bank = await getQuestionBank(id, filter);

  return (
    <>
      <PageHeader
        title="คลังข้อสอบ"
        description={`${bank.course.title} · ข้อสอบในคลังนำไปใช้ได้หลายแบบทดสอบ และสุ่มตามแท็กได้`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}`}>
                <Settings className="size-4" /> ตั้งค่าคอร์ส
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teach/courses/${id}/curriculum`}>
                <ListTree className="size-4" /> จัดสารบัญ
              </Link>
            </Button>
          </>
        }
      />
      <QuestionBank courseId={id} filter={filter} {...bank} />
    </>
  );
}
