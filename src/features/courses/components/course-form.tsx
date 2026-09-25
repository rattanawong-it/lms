"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { RichTextField } from "@/components/editor/rich-text-field";
import { AssetField } from "@/features/uploads/components/asset-field";
import { createCourse, updateCourse } from "@/features/courses/actions";
import { AssetKind } from "@/generated/prisma/enums";
import {
  ENROLL_POLICY_LABEL,
  VISIBILITY_LABEL,
} from "@/features/courses/lib/labels";
import type { CourseEditor } from "@/features/courses/queries";
import { CourseStatus, EnrollPolicy, Visibility } from "@/generated/prisma/enums";
import { canEditPrice } from "@/features/commerce/lib/pricing";
import { submitForm } from "@/lib/form";

type Options = {
  categories: { id: string; name: string }[];
  departments: { id: string; code: string; name: string }[];
};

/** แปลงชื่อคอร์สเป็น slug เบื้องต้น — ผู้ใช้แก้เองต่อได้ */
function suggestSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
}


/** ข้อความผิดพลาดใต้ช่องแบบเลือก — ช่อง Select ไม่ได้ใช้ <Field> จึงต้องแสดงเอง */
function SelectError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-fg text-[12px] font-medium">
      {message}
    </p>
  );
}

/** M04 · FR-04.1 — ฟอร์มสร้าง/แก้ไขข้อมูลคอร์ส */
export function CourseForm({
  course,
  options,
  canChooseDepartment,
}: {
  course?: CourseEditor;
  options: Options;
  /** ผู้สอนธรรมดาย้ายคอร์สข้ามคณะไม่ได้ (§4.1) */
  canChooseDepartment: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [slug, setSlug] = React.useState(course?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(Boolean(course));

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = course ? await updateCourse(formData) : await createCourse(formData);
      if (result.ok) {
        toast.success(result.message);
        setFieldErrors({});
        if (!course && "courseId" in result && result.courseId) {
          router.push(`/teach/courses/${result.courseId}/curriculum`);
        } else {
          router.refresh();
        }
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={submitForm(submit)} className="bg-card border-border space-y-5 rounded-xl border p-5">
      {course ? <input type="hidden" name="id" value={course.id} /> : null}

      <Field
        label="ชื่อคอร์ส"
        name="title"
        defaultValue={course?.title}
        placeholder="เช่น การเขียนโปรแกรมเว็บเบื้องต้น"
        required
        error={fieldErrors.title}
        onChange={(e) => {
          if (!slugTouched) setSlug(suggestSlug(e.currentTarget.value));
        }}
      />

      <Field
        label="slug (ใช้ใน URL ของคอร์ส)"
        name="slug"
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.currentTarget.value);
        }}
        placeholder="เช่น intro-web-programming"
        hint={`หน้าคอร์สจะอยู่ที่ /courses/${slug || "your-slug"}`}
        required
        error={fieldErrors.slug}
      />

      <Field
        label="คำโปรย (ไม่บังคับ)"
        name="summary"
        defaultValue={course?.summary ?? ""}
        placeholder="สรุปสั้น ๆ ว่าผู้เรียนจะได้อะไร แสดงบนการ์ดในคลังคอร์ส"
        error={fieldErrors.summary}
      />

      <AssetField
        label="ภาพปก (ไม่บังคับ)"
        name="coverAssetId"
        kind={AssetKind.IMAGE}
        hint="แนะนำอัตราส่วน 16:9"
        defaultValue={course?.cover ?? null}
      />

      <RichTextField
        name="description"
        label="คำอธิบายคอร์ส (ไม่บังคับ)"
        defaultValue={course?.description}
        hint="แสดงในหน้ารายละเอียดคอร์ส ใส่หัวข้อ รูป ตาราง และวิดีโอประกอบได้"
        placeholder="อธิบายว่าคอร์สนี้สอนอะไร เหมาะกับใคร และต้องเตรียมอะไรมาบ้าง"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="ระดับ (ไม่บังคับ)"
          name="level"
          defaultValue={course?.level ?? ""}
          placeholder="เช่น เบื้องต้น, ปานกลาง, ขั้นสูง"
          error={fieldErrors.level}
        />

        <div className="space-y-[7px]">
          <Label htmlFor="course-category" className="text-[12.5px] font-medium">
            หมวดหมู่
          </Label>
          <Select name="categoryId" defaultValue={course?.categoryId ?? "none"}>
            <SelectTrigger id="course-category" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ยังไม่จัดหมวด</SelectItem>
              {options.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SelectError message={fieldErrors.categoryId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-[7px]">
          <Label htmlFor="course-visibility" className="text-[12.5px] font-medium">
            การมองเห็น
          </Label>
          <Select name="visibility" defaultValue={course?.visibility ?? Visibility.INTERNAL}>
            <SelectTrigger id="course-visibility" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(Visibility).map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SelectError message={fieldErrors.visibility} />
          <p className="text-muted-foreground text-[11.5px]">
            คอร์สสาธารณะปรากฏต่อผู้ที่ยังไม่เข้าสู่ระบบด้วย
          </p>
        </div>

        <div className="space-y-[7px]">
          <Label htmlFor="course-policy" className="text-[12.5px] font-medium">
            นโยบายการลงทะเบียน
          </Label>
          <Select name="enrollPolicy" defaultValue={course?.enrollPolicy ?? EnrollPolicy.OPEN}>
            <SelectTrigger id="course-policy" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(EnrollPolicy).map((p) => (
                <SelectItem key={p} value={p}>
                  {ENROLL_POLICY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SelectError message={fieldErrors.enrollPolicy} />
        </div>
      </div>

      {/* M18 · FR-18.1 — ราคาใช้เฉพาะคอร์สสาธารณะ (Q4) · ผู้สอนแก้ได้ระหว่างร่าง ผู้ดูแลแก้ได้เสมอ (Q3)
          ล็อกแล้วช่องเป็น disabled จึงไม่ถูกส่งไปกับฟอร์ม → server คงราคาเดิม */}
      <Field
        label="ราคา (บาท)"
        name="price"
        inputMode="decimal"
        defaultValue={course?.price ? String(Number(course.price)) : ""}
        placeholder="เว้นว่าง = เรียนฟรี"
        disabled={course ? !canEditPrice(course.status, course.canManage) : false}
        hint={
          course && !canEditPrice(course.status, course.canManage)
            ? "คอร์สส่งตรวจหรือเผยแพร่แล้ว — ติดต่อผู้ดูแลเพื่อเปลี่ยนราคา"
            : course?.status === CourseStatus.DRAFT || !course
              ? "เฉพาะคอร์สสาธารณะ · ราคามีผลเมื่อผู้ดูแลอนุมัติคอร์ส"
              : "เฉพาะคอร์สสาธารณะ"
        }
        error={fieldErrors.price}
        className="max-w-[240px]"
      />

      {canChooseDepartment ? (
        <div className="space-y-[7px]">
          <Label htmlFor="course-department" className="text-[12.5px] font-medium">
            คณะ / หน่วยงานเจ้าของคอร์ส
          </Label>
          <Select name="departmentId" defaultValue={course?.departmentId ?? "none"}>
            <SelectTrigger id="course-department" className="bg-card h-11 w-full rounded-[9px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ไม่สังกัดคณะ</SelectItem>
              {options.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SelectError message={fieldErrors.departmentId} />
          <p className="text-muted-foreground text-[11.5px]">
            คณะเจ้าของคอร์สเป็นผู้อนุมัติการเผยแพร่ และกำหนดว่าผู้ดูแลคนใดแก้ไขคอร์สนี้ได้
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="sequential"
          name="sequential"
          defaultChecked={course?.sequential ?? false}
          className="mt-0.5"
        />
        <Label htmlFor="sequential" className="text-[13px] leading-relaxed font-normal">
          บังคับเรียนตามลำดับ — ผู้เรียนต้องจบบทก่อนหน้าจึงจะเปิดบทถัดไปได้
        </Label>
      </div>

      {/* FR-15.9 — สวิตช์ระดับคอร์ส · ผู้ดูแลระบบยังปิดทับได้อีกชั้นจาก /admin/screen-events */}
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="protectionEnabled"
          name="protectionEnabled"
          defaultChecked={course?.protectionEnabled ?? true}
          className="mt-0.5"
        />
        <Label htmlFor="protectionEnabled" className="text-[13px] leading-relaxed font-normal">
          ป้องกันการคัดลอกเนื้อหา — ลายน้ำ, ปิดคลิกขวา/คัดลอก, เบลอเมื่อสลับหน้าต่าง
          และไม่ให้สั่งพิมพ์
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {course ? "บันทึกข้อมูลคอร์ส" : "สร้างคอร์ส"}
        </Button>
      </div>

      {!course ? (
        <p className="text-muted-foreground text-[11.5px]">
          สร้างแล้วจะพาไปหน้าจัดสารบัญเพื่อเพิ่มบทเรียนต่อทันที
          คอร์สจะยังเป็นฉบับร่างจนกว่าจะส่งให้คณะอนุมัติ
        </p>
      ) : null}
    </form>
  );
}
