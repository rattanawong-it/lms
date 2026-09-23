"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/field";
import { saveBase64 } from "@/components/shared/save-file";
import { AssetKind } from "@/generated/prisma/enums";
import { AssetField } from "@/features/uploads/components/asset-field";
import { previewCertificate, saveCertificateTemplate } from "@/features/certificates/actions";
import { fillText, TEMPLATE_VARIABLES } from "@/features/certificates/lib/text";
import type { CertificateEditorData } from "@/features/certificates/queries";

const SAMPLE = { name: "ชื่อ นามสกุล (ตัวอย่าง)", date: "23 กันยายน 2569", code: "LMS-2026-XXXXXX" };

/**
 * M10 · FR-10.2 — แม่แบบใบประกาศ: หัวเรื่อง ข้อความ + ตัวแปร ผู้ลงนาม โลโก้ ลายเซ็น
 * ตัวอย่างบนหน้าจอเปลี่ยนตามที่พิมพ์ · "ดาวน์โหลดตัวอย่าง PDF" เรนเดอร์จริงจากค่าในฟอร์มโดยยังไม่บันทึก
 */
export function CertificateEditor({ data }: { data: CertificateEditorData }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [heading, setHeading] = React.useState(data.template.heading);
  const [body, setBody] = React.useState(data.template.body);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const bodyId = React.useId();

  const preview = fillText(body, { ...SAMPLE, course: data.course.title });

  function insert(variable: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + variable + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget);
    const isPreview = submitter?.value === "preview";

    startTransition(async () => {
      if (isPreview) {
        const result = await previewCertificate(formData);
        setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
        if (result.ok && result.file) saveBase64(result.file);
        else if (!result.ok) toast.error(result.message);
        return;
      }
      const result = await saveCertificateTemplate(formData);
      setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="courseId" value={data.course.id} />

      <section aria-labelledby="cert-form-title" className="bg-card border-border space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 id="cert-form-title" className="text-[15px] font-semibold">
          ข้อความและผู้ลงนาม
        </h2>
        <Field
          label="หัวเรื่อง"
          name="heading"
          value={heading}
          onChange={(e) => setHeading(e.currentTarget.value)}
          maxLength={80}
          required
          error={errors.heading}
        />

        <div className="space-y-[7px]">
          <Label htmlFor={bodyId} className="text-[12.5px] font-medium">
            ข้อความในใบประกาศ
          </Label>
          <textarea
            ref={bodyRef}
            id={bodyId}
            name="body"
            rows={7}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            aria-invalid={Boolean(errors.body) || undefined}
            aria-describedby={`${bodyId}-hint`}
            className="border-input bg-card focus-visible:ring-ring w-full rounded-[9px] border px-3 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
          />
          <div id={`${bodyId}-hint`} className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-muted-foreground">แทรกตัวแปร:</span>
            {Object.keys(TEMPLATE_VARIABLES).map((variable) => (
              <Button
                key={variable}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 font-mono"
                onClick={() => insert(variable)}
              >
                {variable}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-[11.5px]">
            ขึ้นบรรทัดใหม่ = บรรทัดใหม่ในใบประกาศ · บรรทัดที่มีแต่ {"{ชื่อ}"} หรือ {"{คอร์ส}"} แสดงตัวใหญ่
          </p>
          {errors.body ? (
            <p role="alert" className="text-danger-fg text-[12px] font-medium">
              {errors.body}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อผู้ลงนาม" name="signerName" defaultValue={data.template.signerName} error={errors.signerName} />
          <Field label="ตำแหน่งผู้ลงนาม" name="signerTitle" defaultValue={data.template.signerTitle} error={errors.signerTitle} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AssetField
            label="โลโก้ (ไม่บังคับ)"
            name="logoAssetId"
            kind={AssetKind.IMAGE}
            defaultValue={data.logo}
            hint="PNG หรือ JPEG"
            error={errors.logoAssetId}
          />
          <AssetField
            label="ลายเซ็น (ไม่บังคับ)"
            name="signatureAssetId"
            kind={AssetKind.IMAGE}
            defaultValue={data.signature}
            hint="PNG พื้นใสจะดูดีที่สุด"
            error={errors.signatureAssetId}
          />
        </div>
      </section>

      <section aria-labelledby="cert-preview-title" className="space-y-4">
        <div className="bg-card border-border rounded-xl border p-4 sm:p-5">
          <h2 id="cert-preview-title" className="mb-3 text-[15px] font-semibold">
            ตัวอย่างข้อความ
          </h2>
          <div
            data-certificate-preview
            className="rounded-lg border-4 border-double border-[#9a3412] bg-[#fffdf8] px-4 py-6 text-center text-[#1f2937]"
          >
            <p className="text-[22px] font-bold text-[#9a3412]">{heading || "—"}</p>
            <div className="mt-2 space-y-1 text-[14px] leading-relaxed whitespace-pre-line">{preview}</div>
          </div>
          <p className="text-muted-foreground mt-2 text-[12px]">
            ตัวอย่างบนหน้าจอเป็นข้อความโดยประมาณ — กด “ดาวน์โหลดตัวอย่าง PDF” เพื่อดูหน้าตาจริงพร้อม QR โลโก้ และลายเซ็น
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            ดาวน์โหลดตัวอย่าง PDF
          </Button>
          <Button type="submit" name="intent" value="save" disabled={pending}>
            บันทึกแม่แบบ
          </Button>
        </div>
      </section>
    </form>
  );
}
