"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitForm } from "@/lib/form";
import { deleteAssignment } from "@/features/assignments/actions";

/** ลบได้เฉพาะงานที่ยังไม่มีใครส่ง — server ตรวจซ้ำอีกชั้น */
export function DeleteAssignmentButton({ assignmentId, title }: { assignmentId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await deleteAssignment(formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-danger-fg" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" /> ลบ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบงานนี้?</DialogTitle>
            <DialogDescription>“{title}” จะถูกลบพร้อมคำสั่งงานและการตั้งค่า</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitForm(submit)}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ลบงาน
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
