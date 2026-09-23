import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AssignmentEditor } from "@/features/assignments/components/assignment-editor";
import { getAssignmentEditor } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "สร้างงาน" };

/** M08 · FR-08.1 — สร้างงานที่ต้องส่ง */
export default async function NewAssignmentPage(props: PageProps<"/teach/courses/[id]/assignments/new">) {
  const { id } = await props.params;
  const data = await getAssignmentEditor(id, null);

  return (
    <>
      <PageHeader title="สร้างงาน" description={data.course.title} />
      <AssignmentEditor data={data} />
    </>
  );
}
