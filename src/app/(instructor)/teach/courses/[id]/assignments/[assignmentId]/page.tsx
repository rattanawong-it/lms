import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AssignmentEditor } from "@/features/assignments/components/assignment-editor";
import { getAssignmentEditor } from "@/features/assignments/queries";

export const metadata: Metadata = { title: "แก้ไขงาน" };

/** M08 · FR-08.1 — แก้ไขงานที่ต้องส่ง */
export default async function EditAssignmentPage(
  props: PageProps<"/teach/courses/[id]/assignments/[assignmentId]">,
) {
  const { id, assignmentId } = await props.params;
  const data = await getAssignmentEditor(id, assignmentId);

  return (
    <>
      <PageHeader title={data.assignment?.title ?? "แก้ไขงาน"} description={data.course.title} />
      <AssignmentEditor data={data} />
    </>
  );
}
