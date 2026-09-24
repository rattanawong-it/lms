import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { resetScoreCurve, saveScoreCurve } from "@/features/score-curve/actions";
import { ScoreCurveForm } from "@/features/score-curve/components/score-curve-form";
import { getScoreCurvePage } from "@/features/score-curve/queries";
import { CURVE_SOURCE_LABEL } from "@/features/score-curve/schemas";

export const metadata: Metadata = { title: "เกณฑ์คะแนน" };

/**
 * M09 · FR-09.6/09.7 — Score Curve ทั้งระบบ (SUPER_ADMIN) และรายคณะ (DEPT_ADMIN เฉพาะคณะตัวเอง)
 * คอร์สที่ผู้สอนไม่ได้ตั้งทับใช้เกณฑ์ของคณะเจ้าของคอร์ส → คณะแม่ → ทั้งระบบ
 */
export default async function ScoreCurvePage(props: PageProps<"/admin/score-curve">) {
  const search = await props.searchParams;
  const data = await getScoreCurvePage(typeof search.scope === "string" ? search.scope : undefined);
  const isSystem = data.scope === "system";

  return (
    <>
      <PageHeader
        title="เกณฑ์คะแนน (Score Curve)"
        description="เกณฑ์ตัดเกรดและผ่าน/ไม่ผ่านที่คอร์สใช้เมื่อผู้สอนไม่ได้ตั้งเกณฑ์ของคอร์สเอง"
      />

      {data.options.length > 1 ? (
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-[13px] font-medium">
            ขอบเขต
            <select
              name="scope"
              defaultValue={data.scope}
              className="border-input bg-card h-11 w-[min(320px,calc(100vw-2rem))] rounded-[9px] border px-3 text-[14px] font-normal"
            >
              {data.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="h-11">
            เปิด
          </Button>
        </form>
      ) : null}

      <div className="max-w-[640px] space-y-3">
        <ScoreCurveForm
          key={`${data.scope}:${JSON.stringify(data.curve)}`}
          title={isSystem ? "เกณฑ์ทั้งระบบ" : `เกณฑ์ของ${data.scopeLabel}`}
          badge={
            isSystem
              ? undefined
              : data.custom
                ? "คณะตั้งเกณฑ์เอง"
                : `ใช้${CURVE_SOURCE_LABEL[data.inheritedSource ?? "system"]}อยู่`
          }
          description={
            isSystem
              ? "ใช้กับทุกคณะที่ไม่ได้ตั้งเกณฑ์ของตัวเอง ·"
              : "ใช้กับคอร์สของคณะนี้ (และคณะย่อยที่ไม่ได้ตั้งเอง) ·"
          }
          curve={data.curve}
          hidden={{ scope: data.scope }}
          save={saveScoreCurve}
          reset={!isSystem && data.custom ? { label: "กลับไปใช้เกณฑ์ชั้นบน", action: resetScoreCurve } : undefined}
        />
        {data.updatedAt ? (
          <p className="text-muted-foreground text-[12.5px]">
            แก้ล่าสุด {formatDateTime(data.updatedAt)}
            {data.updatedBy ? ` โดย ${data.updatedBy}` : ""}
          </p>
        ) : null}
      </div>
    </>
  );
}
