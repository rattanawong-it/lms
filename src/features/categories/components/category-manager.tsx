"use client";

import * as React from "react";
import { FolderTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { EmptyState } from "@/components/shared/empty-state";
import { createCategory, deleteCategory, updateCategory } from "@/features/categories/actions";
import type { CategoryRow } from "@/features/categories/queries";
import { submitForm } from "@/lib/form";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: CategoryRow }
  | { mode: "delete"; row: CategoryRow };

/** M03 · FR-03.1 — ตาราง + ฟอร์มจัดการหมวดหมู่คอร์ส */
export function CategoryManager({ rows }: { rows: CategoryRow[] }) {
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" });
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function close() {
    setDialog({ mode: "closed" });
    setFieldErrors({});
  }

  function submit(formData: FormData, kind: "create" | "edit" | "delete") {
    startTransition(async () => {
      const action =
        kind === "create" ? createCategory : kind === "edit" ? updateCategory : deleteCategory;
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        close();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  const editing = dialog.mode === "edit" ? dialog.row : null;
  const isForm = dialog.mode === "create" || dialog.mode === "edit";

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="lg" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-4" /> เพิ่มหมวดหมู่
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="size-6" />}
          title="ยังไม่มีหมวดหมู่คอร์ส"
          description="หมวดหมู่ใช้เป็นตัวกรองในหน้าคลังคอร์ส สร้างหมวดหลักก่อนแล้วค่อยเพิ่มหมวดย่อยไว้ข้างใต้"
          action={
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" /> เพิ่มหมวดหมู่แรก
            </Button>
          }
        />
      ) : (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <caption className="sr-only">รายการหมวดหมู่คอร์ส</caption>
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    slug
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    ชื่อหมวดหมู่
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    อยู่ภายใต้
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    คอร์ส
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-line border-b last:border-0">
                    <td className="num text-muted-foreground px-4 py-3">{row.slug}</td>
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="text-muted-foreground px-4 py-3">{row.parentName ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{row.courseCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`แก้ไข ${row.name}`}
                          onClick={() => setDialog({ mode: "edit", row })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`ลบ ${row.name}`}
                          className="text-destructive"
                          onClick={() => setDialog({ mode: "delete", row })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ฟอร์มเพิ่ม/แก้ไข */}
      <Dialog open={isForm} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={submitForm((fd) => submit(fd, dialog.mode === "edit" ? "edit" : "create"))}>
            <DialogHeader>
              <DialogTitle>{editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</DialogTitle>
              <DialogDescription>
                slug ปรากฏใน URL ของหน้าคลังคอร์ส จึงควรเป็นภาษาอังกฤษตัวเล็กและไม่ซ้ำกัน
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

              <Field
                label="slug"
                name="slug"
                defaultValue={editing?.slug}
                placeholder="เช่น it, business, soft-skills"
                required
                error={fieldErrors.slug}
              />
              <Field
                label="ชื่อหมวดหมู่"
                name="name"
                defaultValue={editing?.name}
                placeholder="เช่น เทคโนโลยีสารสนเทศ"
                required
                error={fieldErrors.name}
              />

              <div className="space-y-[7px]">
                <Label htmlFor="category-parent" className="text-[12.5px] font-medium">
                  อยู่ภายใต้ (ไม่บังคับ)
                </Label>
                <Select name="parentId" defaultValue={editing?.parentId ?? "none"}>
                  <SelectTrigger id="category-parent" className="bg-card h-11 w-full rounded-[9px]">
                    <SelectValue placeholder="ไม่มี (เป็นหมวดระดับบนสุด)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่มี (เป็นหมวดระดับบนสุด)</SelectItem>
                    {rows
                      .filter((r) => r.id !== editing?.id)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {fieldErrors.parentId ? (
                  <p role="alert" className="text-danger-fg text-[12px] font-medium">
                    {fieldErrors.parentId}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "บันทึกการแก้ไข" : "เพิ่มหมวดหมู่"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ยืนยันการลบ */}
      <Dialog open={dialog.mode === "delete"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-[420px]">
          <form action={(fd) => submit(fd, "delete")}>
            <DialogHeader>
              <DialogTitle>ลบหมวดหมู่</DialogTitle>
              <DialogDescription>
                {dialog.mode === "delete"
                  ? `ต้องการลบ "${dialog.row.name}" ใช่หรือไม่ การลบทำได้เฉพาะเมื่อไม่มีคอร์สหรือหมวดย่อยผูกอยู่`
                  : null}
              </DialogDescription>
            </DialogHeader>
            {dialog.mode === "delete" ? (
              <input type="hidden" name="id" value={dialog.row.id} />
            ) : null}
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ลบหมวดนี้
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
