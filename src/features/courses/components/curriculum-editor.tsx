"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  createLesson,
  createSection,
  deleteLesson,
  deleteSection,
  reorder,
  updateLesson,
  updateSection,
} from "@/features/courses/actions";
import {
  LESSON_TYPE_LABEL,
  LESSON_TYPE_PHASE,
  VIDEO_SOURCE_LABEL,
} from "@/features/courses/lib/labels";
import { SortableItem, SortableList } from "@/features/courses/components/sortable-row";
import type { CurriculumSection } from "@/features/courses/queries";
import { LessonType, VideoSource } from "@/generated/prisma/enums";

type Lesson = CurriculumSection["lessons"][number];

type DialogState =
  | { mode: "closed" }
  | { mode: "section-create" }
  | { mode: "section-edit"; section: CurriculumSection }
  | { mode: "section-delete"; section: CurriculumSection }
  | { mode: "lesson-create"; sectionId: string }
  | { mode: "lesson-edit"; lesson: Lesson }
  | { mode: "lesson-delete"; lesson: Lesson };

/** ค่าที่ input type="datetime-local" ต้องการ */
function toLocalInput(value: Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** M04 · FR-04.2–04.4 — จัดการบทและบทเรียน พร้อมลากเรียงลำดับ */
export function CurriculumEditor({
  courseId,
  sections: initialSections,
}: {
  courseId: string;
  sections: CurriculumSection[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" });
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [lessonType, setLessonType] = React.useState<LessonType>(LessonType.VIDEO);
  const [videoSource, setVideoSource] = React.useState<string>(VideoSource.YOUTUBE);

  // ลำดับที่แสดงระหว่างรอ server ตอบ — ถ้าบันทึกไม่สำเร็จจะรีเฟรชกลับเป็นของจริง
  const [sections, setSections] = React.useState(initialSections);
  const [syncedFrom, setSyncedFrom] = React.useState(initialSections);
  if (syncedFrom !== initialSections) {
    // ข้อมูลใหม่จาก server มาถึง — ปรับ state ระหว่าง render ตามแนวทางของ React
    // (ไม่ใช้ effect เพราะ setState ใน effect ทำให้ render ซ้ำโดยไม่จำเป็น)
    setSyncedFrom(initialSections);
    setSections(initialSections);
  }

  function close() {
    setDialog({ mode: "closed" });
    setFieldErrors({});
  }

  /** เปิดฟอร์มบทเรียนพร้อมตั้งค่าเริ่มต้นของช่องที่ขึ้นกับชนิด */
  function openLessonForm(next: DialogState) {
    if (next.mode === "lesson-edit") {
      setLessonType(next.lesson.type as LessonType);
      setVideoSource(next.lesson.videoSource ?? VideoSource.YOUTUBE);
    } else {
      setLessonType(LessonType.VIDEO);
      setVideoSource(VideoSource.YOUTUBE);
    }
    setFieldErrors({});
    setDialog(next);
  }

  function run(action: () => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string> }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        close();
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  function reorderSections(ids: string[]) {
    const byId = new Map(sections.map((s) => [s.id, s]));
    setSections(ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])));

    startTransition(async () => {
      const result = await reorder({ courseId, kind: "section", ids });
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  function reorderLessons(sectionId: string, ids: string[]) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const byId = new Map(s.lessons.map((l) => [l.id, l]));
        return { ...s, lessons: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) };
      }),
    );

    startTransition(async () => {
      const result = await reorder({ courseId, kind: "lesson", ids, sectionId });
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  const editingLesson = dialog.mode === "lesson-edit" ? dialog.lesson : null;
  const isLessonForm = dialog.mode === "lesson-create" || dialog.mode === "lesson-edit";
  const isSectionForm = dialog.mode === "section-create" || dialog.mode === "section-edit";
  const editingSection = dialog.mode === "section-edit" ? dialog.section : null;

  const totalLessons = sections.reduce((sum, s) => sum + s.lessons.length, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-[13px]">
          <span className="num font-medium">{sections.length}</span> บท ·{" "}
          <span className="num font-medium">{totalLessons}</span> บทเรียน
        </p>
        <Button size="lg" onClick={() => setDialog({ mode: "section-create" })}>
          <Plus className="size-4" /> เพิ่มบท
        </Button>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" />}
          title="ยังไม่มีบทในคอร์สนี้"
          description="เริ่มจากสร้างบทแรก แล้วค่อยเพิ่มบทเรียนไว้ข้างใน ลากปุ่มจับด้านซ้ายเพื่อเรียงลำดับได้ทุกเมื่อ"
          action={
            <Button onClick={() => setDialog({ mode: "section-create" })}>
              <Plus className="size-4" /> เพิ่มบทแรก
            </Button>
          }
        />
      ) : (
        <SortableList items={sections} onReorder={reorderSections} className="space-y-3">
          {(section, index) => (
            <SortableItem key={section.id} id={section.id} label={`บท ${section.title}`}>
              {(handle) => (
                <div className="bg-card border-border overflow-hidden rounded-xl border">
                  <div className="bg-background border-line flex items-center gap-2 border-b px-3 py-2.5">
                    {handle}
                    <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      <span className="num text-muted-foreground mr-2">{index + 1}.</span>
                      {section.title}
                    </h3>
                    <span className="text-muted-foreground num shrink-0 text-[12px]">
                      {section.lessons.length} บทเรียน
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`แก้ไขชื่อบท ${section.title}`}
                      onClick={() => setDialog({ mode: "section-edit", section })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`ลบบท ${section.title}`}
                      className="text-destructive"
                      onClick={() => setDialog({ mode: "section-delete", section })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {section.lessons.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-4 text-center text-[12.5px]">
                      ยังไม่มีบทเรียนในบทนี้
                    </p>
                  ) : (
                    <SortableList
                      items={section.lessons}
                      onReorder={(ids) => reorderLessons(section.id, ids)}
                    >
                      {(lesson) => (
                        <SortableItem
                          key={lesson.id}
                          id={lesson.id}
                          label={`บทเรียน ${lesson.title}`}
                          className="border-line border-b last:border-0"
                        >
                          {(lessonHandle) => (
                            <div className="flex items-center gap-2 px-3 py-2">
                              {lessonHandle}
                              <span className="min-w-0 flex-1 truncate text-[13px]">
                                {lesson.title}
                              </span>
                              {lesson.isPreview ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-success-bg text-success-fg shrink-0"
                                >
                                  ตัวอย่าง
                                </Badge>
                              ) : null}
                              <span className="text-muted-foreground shrink-0 text-[12px]">
                                {LESSON_TYPE_LABEL[lesson.type as LessonType] ?? lesson.type}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`แก้ไขบทเรียน ${lesson.title}`}
                                onClick={() => openLessonForm({ mode: "lesson-edit", lesson })}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`ลบบทเรียน ${lesson.title}`}
                                className="text-destructive"
                                onClick={() => setDialog({ mode: "lesson-delete", lesson })}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )}
                        </SortableItem>
                      )}
                    </SortableList>
                  )}

                  <div className="border-line border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => openLessonForm({ mode: "lesson-create", sectionId: section.id })}
                    >
                      <Plus className="size-4" /> เพิ่มบทเรียนในบทนี้
                    </Button>
                  </div>
                </div>
              )}
            </SortableItem>
          )}
        </SortableList>
      )}

      {/* ฟอร์มบท */}
      <Dialog open={isSectionForm} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-[420px]">
          <form
            action={(fd) =>
              run(() => (editingSection ? updateSection(fd) : createSection(fd)))
            }
          >
            <DialogHeader>
              <DialogTitle>{editingSection ? "แก้ไขชื่อบท" : "เพิ่มบท"}</DialogTitle>
              <DialogDescription>
                บทใช้จัดกลุ่มบทเรียน เช่น แบ่งตามสัปดาห์หรือตามหัวข้อใหญ่
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              {editingSection ? (
                <input type="hidden" name="id" value={editingSection.id} />
              ) : (
                <input type="hidden" name="courseId" value={courseId} />
              )}
              <Field
                label="ชื่อบท"
                name="title"
                defaultValue={editingSection?.title}
                placeholder="เช่น สัปดาห์ที่ 1 · ความรู้พื้นฐาน"
                required
                error={fieldErrors.title}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editingSection ? "บันทึก" : "เพิ่มบท"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ฟอร์มบทเรียน */}
      <Dialog open={isLessonForm} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[520px]">
          <form
            action={(fd) => run(() => (editingLesson ? updateLesson(fd) : createLesson(fd)))}
          >
            <DialogHeader>
              <DialogTitle>{editingLesson ? "แก้ไขบทเรียน" : "เพิ่มบทเรียน"}</DialogTitle>
              <DialogDescription>
                ช่องที่ต้องกรอกเปลี่ยนตามชนิดบทเรียนที่เลือก
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {editingLesson ? (
                <input type="hidden" name="id" value={editingLesson.id} />
              ) : dialog.mode === "lesson-create" ? (
                <input type="hidden" name="sectionId" value={dialog.sectionId} />
              ) : null}

              <Field
                label="ชื่อบทเรียน"
                name="title"
                defaultValue={editingLesson?.title}
                placeholder="เช่น แนะนำโครงสร้างของภาษา"
                required
                error={fieldErrors.title}
              />

              <div className="space-y-[7px]">
                <Label htmlFor="lesson-type" className="text-[12.5px] font-medium">
                  ชนิดบทเรียน
                </Label>
                <Select
                  name="type"
                  value={lessonType}
                  onValueChange={(v) => setLessonType(v as LessonType)}
                >
                  <SelectTrigger id="lesson-type" className="bg-card h-11 w-full rounded-[9px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(LessonType).map((t) => (
                      <SelectItem key={t} value={t}>
                        {LESSON_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {LESSON_TYPE_PHASE[lessonType] ? (
                  <p className="text-muted-foreground text-[11.5px]">
                    ตอนนี้บันทึกได้แค่ชื่อและตำแหน่ง — {LESSON_TYPE_PHASE[lessonType]}
                  </p>
                ) : null}
              </div>

              {lessonType === LessonType.VIDEO ? (
                <>
                  <div className="space-y-[7px]">
                    <Label htmlFor="lesson-source" className="text-[12.5px] font-medium">
                      ที่มาของวิดีโอ
                    </Label>
                    <Select name="videoSource" value={videoSource} onValueChange={setVideoSource}>
                      <SelectTrigger
                        id="lesson-source"
                        className="bg-card h-11 w-full rounded-[9px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(VideoSource).map((s) => (
                          <SelectItem key={s} value={s}>
                            {VIDEO_SOURCE_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.videoSource ? (
                      <p role="alert" className="text-danger-fg text-[12px] font-medium">
                        {fieldErrors.videoSource}
                      </p>
                    ) : null}
                  </div>

                  {videoSource === VideoSource.UPLOAD ? (
                    <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
                      การอัปโหลดไฟล์วิดีโอเปิดใช้งานในขั้น 4 ตอนนี้บันทึกบทเรียนไว้ก่อนได้
                      แล้วค่อยกลับมาแนบไฟล์
                    </p>
                  ) : (
                    <Field
                      label="ลิงก์วิดีโอ"
                      name="videoUrl"
                      defaultValue={editingLesson?.videoUrl ?? ""}
                      placeholder="https://www.youtube.com/watch?v=..."
                      hint="รองรับ YouTube และ Vimeo"
                      error={fieldErrors.videoUrl}
                    />
                  )}

                  <Field
                    label="ความยาว (วินาที · ไม่บังคับ)"
                    name="durationSec"
                    type="number"
                    min={0}
                    defaultValue={editingLesson?.durationSec ?? ""}
                    placeholder="เช่น 600"
                    error={fieldErrors.durationSec}
                  />
                </>
              ) : null}

              {lessonType === LessonType.LIVE ? (
                <>
                  <Field
                    label="ลิงก์ห้องเรียนสด"
                    name="liveUrl"
                    defaultValue={editingLesson?.liveUrl ?? ""}
                    placeholder="https://meet.google.com/..."
                    error={fieldErrors.liveUrl}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="เริ่ม"
                      name="liveStartAt"
                      type="datetime-local"
                      defaultValue={toLocalInput(editingLesson?.liveStartAt ?? null)}
                      error={fieldErrors.liveStartAt}
                    />
                    <Field
                      label="สิ้นสุด (ไม่บังคับ)"
                      name="liveEndAt"
                      type="datetime-local"
                      defaultValue={toLocalInput(editingLesson?.liveEndAt ?? null)}
                      error={fieldErrors.liveEndAt}
                    />
                  </div>
                </>
              ) : null}

              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="isPreview"
                  name="isPreview"
                  defaultChecked={editingLesson?.isPreview ?? false}
                  className="mt-0.5"
                />
                <Label htmlFor="isPreview" className="text-[13px] leading-relaxed font-normal">
                  เปิดเป็นบทเรียนตัวอย่าง — ดูได้โดยไม่ต้องลงทะเบียน (FR-04.4)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editingLesson ? "บันทึก" : "เพิ่มบทเรียน"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ยืนยันการลบ */}
      <Dialog
        open={dialog.mode === "section-delete" || dialog.mode === "lesson-delete"}
        onOpenChange={(open) => (open ? null : close())}
      >
        <DialogContent className="sm:max-w-[420px]">
          <form
            action={(fd) =>
              run(() => (dialog.mode === "section-delete" ? deleteSection(fd) : deleteLesson(fd)))
            }
          >
            <DialogHeader>
              <DialogTitle>
                {dialog.mode === "section-delete" ? "ลบบท" : "ลบบทเรียน"}
              </DialogTitle>
              <DialogDescription>
                {dialog.mode === "section-delete"
                  ? `ลบบท "${dialog.section.title}" พร้อมบทเรียน ${dialog.section.lessons.length} รายการข้างใน การลบนี้ย้อนกลับไม่ได้`
                  : dialog.mode === "lesson-delete"
                    ? `ลบบทเรียน "${dialog.lesson.title}" การลบนี้ย้อนกลับไม่ได้`
                    : null}
              </DialogDescription>
            </DialogHeader>

            {dialog.mode === "section-delete" ? (
              <input type="hidden" name="id" value={dialog.section.id} />
            ) : dialog.mode === "lesson-delete" ? (
              <input type="hidden" name="id" value={dialog.lesson.id} />
            ) : null}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={close}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                ลบ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
