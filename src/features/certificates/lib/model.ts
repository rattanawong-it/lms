import type { CertificateTemplate } from "@/features/certificates/schemas";
import {
  fillLine,
  pdfText,
  pdfWords,
  UNBREAKABLE_VARS,
  type TemplateVars,
} from "@/features/certificates/lib/text";

/**
 * M10 — ข้อมูลทุกตัวอักษรที่จะวางลง PDF (pure function)
 *
 * ตัว render (`pdf.tsx`) วาดเฉพาะค่าจากโมเดลนี้ และทุกสตริงในโมเดลผ่าน `pdfText()` แล้ว
 * unit test เดินทุกสตริงในโมเดลเพื่อกันคนเผลอส่งข้อความดิบที่มี `ำ` เข้า PDF (phase-2-plan ขั้น 0)
 */

/** หนึ่งกล่องในบรรทัด — ขึ้นบรรทัดใหม่ได้เฉพาะระหว่างกล่อง */
export type Run = { text: string };

export type ModelLine = {
  /** บรรทัดที่มีแต่ตัวแปรตัวเดียว (เช่น {ชื่อ} หรือ {คอร์ส}) แสดงตัวใหญ่ */
  emphasized: boolean;
  runs: Run[];
};

export type CertificateModel = {
  heading: string;
  lines: ModelLine[];
  signerName: string;
  signerTitle: string;
  code: string;
  verifyUrl: string;
  verifyLabel: string;
};

function toRuns(parts: ReturnType<typeof fillLine>): Run[] {
  return parts.flatMap((part) =>
    part.variable && UNBREAKABLE_VARS.has(part.variable)
      ? [{ text: pdfText(part.text) }]
      : pdfWords(part.text).map((text) => ({ text })),
  );
}

export function buildCertificateModel(
  template: CertificateTemplate,
  vars: TemplateVars,
  verifyUrl: string,
): CertificateModel {
  const lines = template.body
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = fillLine(raw, vars);
      return {
        emphasized: parts.length === 1 && parts[0]!.variable !== null,
        runs: toRuns(parts),
      };
    });

  return {
    heading: pdfText(template.heading),
    lines,
    signerName: pdfText(template.signerName),
    signerTitle: pdfText(template.signerTitle),
    code: pdfText(vars.code),
    verifyUrl,
    verifyLabel: pdfText(`ตรวจสอบใบประกาศ: ${verifyUrl}`),
  };
}
