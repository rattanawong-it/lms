"use client";

import * as React from "react";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { EmptyState } from "@/components/shared/empty-state";
import {
  createDepartment,
  deleteDepartment,
  updateDepartment,
} from "@/features/departments/actions";
import type { DepartmentRow } from "@/features/departments/queries";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: DepartmentRow }
  | { mode: "delete"; row: DepartmentRow };

/** M02 · FR-02.1 — ตาราง + ฟอร์มจัดการคณะ/หน่วยงาน (รองรับลำดับชั้น) */
export function DepartmentManager({ rows }: { rows: DepartmentRow[] }) {
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
        kind === "create" ? createDepartment : kind === "edit" ? updateDepartment : deleteDepartment;
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
          <Plus className="size-4" /> เพิ่มคณะ / หน่วยงาน
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="ยังไม่มีคณะหรือหน่วยงานในระบบ"
          description="เริ่มจากสร้างคณะหลักก่อน แล้วค่อยเพิ่มภาควิชาหรือหน่วยงานย่อยไว้ใต้คณะนั้น"
          action={
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" /> เพิ่มคณะแรก
            </Button>
          }
        />
      ) : (
        <div className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="bg-background border-line text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">รหัส</th>
                  <th scope="col" className="px-4 py-3 font-medium">ชื่อคณะ / หน่วยงาน</th>
                  <th scope="col" className="px-4 py-3 font-medium">อยู่ภายใต้</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">ผู้ใช้</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">คอร์ส</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-line border-b last:border-0">
                    <td className="num px-4 py-3 font-medium">{row.code}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="text-muted-foreground px-4 py-3">{row.parentName ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{row.userCount}</td>
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
          <form action={(fd) => submit(fd, dialog.mode === "edit" ? "edit" : "create")}>
            <DialogHeader>
              <DialogTitle>{editing ? "แก้ไขคณะ / หน่วยงาน" : "เพิ่มคณะ / หน่วยงาน"}</DialogTitle>
              <DialogDescription>
                รหัสคณะใช้อ้างอิงตอนนำเข้าผู้ใช้จาก CSV จึงควรสั้นและไม่ซ้ำกัน
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

              <Field
                label="รหัสคณะ"
                name="code"
                defaultValue={editing?.code}
                placeholder="เช่น BUS, ENG, IT"
                required
                error={fieldErrors.code}
              />
              <Field
                label="ชื่อคณะ / หน่วยงาน"
                name="name"
                defaultValue={editing?.name}
                placeholder="เช่น คณะบริหารธุรกิจ"
                required
                error={fieldErrors.name}
              />

              <div className="space-y-[7px]">
                <Label htmlFor="parentId" className="text-[12.5px] font-medium">
                  อยู่ภายใต้ (ไม่บังคับ)
                </Label>
                <Select name="parentId" defaultValue={editing?.parentId ?? "none"}>
                  <SelectTrigger id="parentId" className="bg-card h-11 w-full rounded-[9px]">
                    <SelectValue placeholder="ไม่มี (เป็นหน่วยงานระดับบนสุด)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่มี (เป็นหน่วยงานระดับบนสุด)</SelectItem>
                    {rows
                      .filter((r) => r.id !== editing?.id)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.code} · {r.name}
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
                {editing ? "บันทึกการแก้ไข" : "เพิ่มคณะ"}
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
              <DialogTitle>ลบคณะ / หน่วยงาน</DialogTitle>
              <DialogDescription>
                {dialog.mode === "delete"
                  ? `ต้องการลบ "${dialog.row.name}" ใช่หรือไม่ การลบทำได้เฉพาะเมื่อไม่มีผู้ใช้ คอร์ส หรือหน่วยงานย่อยผูกอยู่`
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
                ลบคณะนี้
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
