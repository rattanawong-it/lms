"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { EmptyState } from "@/components/shared/empty-state";
import { RichTextField } from "@/components/editor/rich-text-field";
import { AnnouncementScope } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { submitForm } from "@/lib/form";
import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementPinned,
  updateAnnouncement,
} from "@/features/announcements/actions";
import { ANNOUNCEMENT_TITLE_MAX, SCOPE_LABEL } from "@/features/announcements/schemas";
import {
  AnnouncementCard,
  type AnnouncementCardData,
} from "@/features/announcements/components/announcement-card";

/**
 * กลุ่มผู้รับที่ผู้ใช้เลือกได้ในหน้านี้
 *   course — หน้าคอร์สของผู้สอน (ระดับคอร์สอย่างเดียว)
 *   org    — หน้าผู้ดูแล (ทั้งระบบ/ระดับคณะ ตามสิทธิ์)
 */
export type AnnouncementAudience =
  | { kind: "course"; courseId: string }
  | {
      kind: "org";
      canPostGlobal: boolean;
      departments: { id: string; code: string; name: string }[];
    };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-fg text-[12px] font-medium">
      {message}
    </p>
  );
}

/** เลือกระดับและคณะ — เฉพาะหน้าผู้ดูแล */
function OrgTargetFields({
  audience,
  errors,
}: {
  audience: Extract<AnnouncementAudience, { kind: "org" }>;
  errors: Record<string, string>;
}) {
  const [scope, setScope] = React.useState<AnnouncementScope>(
    audience.canPostGlobal ? AnnouncementScope.GLOBAL : AnnouncementScope.DEPARTMENT,
  );
  const onlyDepartment = audience.departments.length === 1 ? audience.departments[0] : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-[7px]">
        <Label htmlFor="announcement-scope" className="text-[12.5px] font-medium">
          ส่งถึง
        </Label>
        {audience.canPostGlobal ? (
          <Select
            name="scope"
            value={scope}
            onValueChange={(value) => setScope(value as AnnouncementScope)}
          >
            <SelectTrigger id="announcement-scope" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AnnouncementScope.GLOBAL}>
                {SCOPE_LABEL.GLOBAL} (ผู้ใช้ทุกคน)
              </SelectItem>
              <SelectItem value={AnnouncementScope.DEPARTMENT}>
                {SCOPE_LABEL.DEPARTMENT} (ผู้ใช้ในคณะที่เลือก)
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <>
            <input type="hidden" name="scope" value={AnnouncementScope.DEPARTMENT} />
            <p id="announcement-scope" className="text-fg-2 flex h-11 items-center text-[13.5px]">
              {SCOPE_LABEL.DEPARTMENT} (ผู้ใช้ในคณะของคุณ)
            </p>
          </>
        )}
        <FieldError message={errors.scope} />
      </div>

      {scope === AnnouncementScope.DEPARTMENT ? (
        <div className="space-y-[7px]">
          <Label htmlFor="announcement-department" className="text-[12.5px] font-medium">
            คณะ / หน่วยงาน
          </Label>
          {onlyDepartment && !audience.canPostGlobal ? (
            <>
              <input type="hidden" name="departmentId" value={onlyDepartment.id} />
              <p id="announcement-department" className="text-fg-2 flex h-11 items-center text-[13.5px]">
                {onlyDepartment.name}
              </p>
            </>
          ) : (
            <Select name="departmentId">
              <SelectTrigger
                id="announcement-department"
                aria-invalid={Boolean(errors.departmentId) || undefined}
                className="bg-card h-11 w-full rounded-[9px]"
              >
                <SelectValue placeholder="เลือกคณะ" />
              </SelectTrigger>
              <SelectContent>
                {audience.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldError message={errors.departmentId} />
        </div>
      ) : null}
    </div>
  );
}

/** ฟอร์มเขียน/แก้ประกาศ — remount ด้วย `key` เมื่อสลับรายการที่แก้ เพื่อให้ editor รับค่าใหม่ */
function Composer({
  audience,
  editing,
  onDone,
  onCancelEdit,
}: {
  audience: AnnouncementAudience;
  editing: AnnouncementCardData | null;
  onDone: () => void;
  onCancelEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = editing ? await updateAnnouncement(formData) : await createAnnouncement(formData);
      if (result.ok) {
        toast.success(result.message);
        setErrors({});
        onDone();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <form
      onSubmit={submitForm(submit)}
      aria-labelledby="announcement-composer"
      className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <h2 id="announcement-composer" className="flex items-center gap-2 text-[15px] font-semibold">
        <Megaphone className="text-primary size-[18px]" aria-hidden />
        {editing ? "แก้ไขประกาศ" : "เขียนประกาศใหม่"}
      </h2>

      {editing ? (
        <>
          <input type="hidden" name="id" value={editing.id} />
          <p className="text-muted-foreground text-[12.5px]">
            ส่งถึง: {SCOPE_LABEL[editing.scope]} — เปลี่ยนกลุ่มผู้รับไม่ได้ และการแก้ไขจะไม่แจ้งเตือนซ้ำ
          </p>
        </>
      ) : audience.kind === "course" ? (
        <>
          <input type="hidden" name="scope" value={AnnouncementScope.COURSE} />
          <input type="hidden" name="courseId" value={audience.courseId} />
          <p className="text-muted-foreground text-[12.5px]">
            ส่งถึงผู้เรียนทุกคนที่ยังมีสิทธิ์เรียนคอร์สนี้ และแสดงในหน้า “ประกาศ” ของผู้เรียน
          </p>
        </>
      ) : (
        <OrgTargetFields audience={audience} errors={errors} />
      )}

      <Field
        label="หัวข้อประกาศ"
        name="title"
        defaultValue={editing?.title}
        maxLength={ANNOUNCEMENT_TITLE_MAX}
        placeholder="เช่น เลื่อนเวลาเรียนสดสัปดาห์นี้"
        required
        error={errors.title}
      />

      <RichTextField
        name="body"
        label="เนื้อหา"
        defaultValue={editing?.body}
        minHeight={160}
        placeholder="รายละเอียดที่ผู้รับควรรู้"
        error={errors.body}
      />

      <div className="flex items-center gap-2.5">
        <Checkbox id="announcement-pinned" name="pinned" defaultChecked={editing?.pinned ?? false} />
        <Label htmlFor="announcement-pinned" className="text-[13px] font-normal">
          ปักหมุดไว้บนสุด
        </Label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <Button type="button" variant="outline" onClick={onCancelEdit} disabled={pending}>
            ยกเลิกการแก้ไข
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {editing ? "บันทึกการแก้ไข" : "เผยแพร่ประกาศ"}
        </Button>
      </div>
    </form>
  );
}

/** M11 · FR-11.1 — เขียน แก้ ปักหมุด และลบประกาศ (หน้าคอร์สของผู้สอน และหน้าผู้ดูแล) */
export function AnnouncementManager({
  audience,
  announcements,
}: {
  audience: AnnouncementAudience;
  announcements: AnnouncementCardData[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<AnnouncementCardData | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const [deleting, setDeleting] = React.useState<AnnouncementCardData | null>(null);
  const [pending, startTransition] = React.useTransition();
  const composerRef = React.useRef<HTMLDivElement>(null);

  function run(action: (formData: FormData) => Promise<ActionResult>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function startEdit(a: AnnouncementCardData) {
    setEditing(a);
    setFormKey((k) => k + 1);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetComposer() {
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div ref={composerRef} className="scroll-mt-20">
        <Composer
          key={formKey}
          audience={audience}
          editing={editing}
          onDone={resetComposer}
          onCancelEdit={resetComposer}
        />
      </div>

      <section aria-labelledby="announcement-list" className="space-y-3">
        <h2 id="announcement-list" className="text-[15px] font-semibold">
          ประกาศที่เผยแพร่แล้ว ({announcements.length})
        </h2>

        {announcements.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title="ยังไม่มีประกาศ"
            description="ประกาศที่เผยแพร่จะแสดงที่นี่ และผู้รับจะได้รับการแจ้งเตือนที่กระดิ่ง"
          />
        ) : (
          announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              collapsed
              actions={
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(a)}>
                    <Pencil className="size-3.5" /> แก้ไข
                  </Button>
                  <form onSubmit={submitForm((fd) => run(setAnnouncementPinned, fd))}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="pinned" value={a.pinned ? "false" : "true"} />
                    <Button type="submit" variant="outline" size="sm" disabled={pending}>
                      {a.pinned ? (
                        <>
                          <PinOff className="size-3.5" /> เลิกปักหมุด
                        </>
                      ) : (
                        <>
                          <Pin className="size-3.5" /> ปักหมุด
                        </>
                      )}
                    </Button>
                  </form>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-danger-fg"
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 className="size-3.5" /> ลบ
                  </Button>
                </>
              }
            />
          ))
        )}
      </section>

      <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบประกาศนี้?</DialogTitle>
            <DialogDescription>
              “{deleting?.title}” จะหายไปจากหน้าประกาศของผู้รับ พร้อมการแจ้งเตือนที่เกี่ยวข้อง
              และกู้คืนไม่ได้
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submitForm((fd) => {
              run(deleteAnnouncement, fd);
              if (editing?.id === deleting?.id) resetComposer();
              setDeleting(null);
            })}
          >
            <input type="hidden" name="id" value={deleting?.id ?? ""} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                ลบประกาศ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
