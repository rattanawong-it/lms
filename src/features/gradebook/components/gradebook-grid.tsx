"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBase64 } from "@/components/shared/save-file";
import { formatScore } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { exportGradebook, resetGrade, setGrade } from "@/features/gradebook/actions";
import type { Gradebook } from "@/features/gradebook/queries";
import { GradingMode } from "@/generated/prisma/enums";
import { SOURCE_LABEL } from "@/features/gradebook/schemas";

type Item = Gradebook["items"][number];
type Row = Gradebook["rows"][number];

/**
 * ช่องคะแนนหนึ่งช่อง — บันทึกเมื่อออกจากช่องหรือกด Enter (เฉพาะเมื่อค่าเปลี่ยน)
 * ช่องของแบบทดสอบ/งานที่ถูกแก้ทับมีปุ่มกลับไปใช้คะแนนอัตโนมัติ
 */
function GradeCell({ item, row }: { item: Item; row: Row }) {
  const router = useRouter();
  const cell = row.cells[item.id]!;
  const initial = cell.score === null ? "" : String(cell.score);
  const [value, setValue] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  // ค่าที่ส่งไปแล้ว — Enter ตามด้วย blur (ช่องถูก disable ระหว่างบันทึก) ต้องไม่บันทึกซ้ำ
  const sent = React.useRef(initial);
  const label = `คะแนน ${item.title} ของ ${row.student.name}`;

  function run(action: typeof setGrade, extra?: Record<string, string>) {
    const formData = new FormData();
    formData.set("itemId", item.id);
    formData.set("userId", row.student.id);
    for (const [k, v] of Object.entries(extra ?? {})) formData.set(k, v);
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
        sent.current = initial;
        setValue(initial);
      }
    });
  }

  function commit() {
    const next = value.trim();
    if (next === sent.current) return;
    sent.current = next;
    run(setGrade, { score: next });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={item.maxScore}
        step={0.01}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        disabled={pending}
        aria-label={label}
        data-grade-cell
        className={cn(
          "border-input bg-card focus-visible:ring-ring h-11 w-[88px] rounded-[9px] border px-2 text-right text-[13.5px] tabular-nums outline-none focus-visible:ring-2",
          cell.overridden && "border-warning-fg/60",
        )}
      />
      {pending ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden /> : null}
      {cell.overridden && !pending ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          title="แก้ทับอยู่ — กดเพื่อกลับไปใช้คะแนนอัตโนมัติ"
          aria-label={`กลับไปใช้คะแนนอัตโนมัติ: ${label}`}
          onClick={() => run(resetGrade)}
        >
          <RotateCcw className="text-warning-fg size-4" />
        </Button>
      ) : null}
    </div>
  );
}

/** เปลี่ยน key เมื่อค่าที่บันทึกเปลี่ยน ให้ช่องรับค่าใหม่หลัง refresh */
function cellKey(item: Item, row: Row) {
  const cell = row.cells[item.id]!;
  return `${item.id}:${cell.score ?? ""}:${cell.overridden}`;
}

function Total({ row }: { row: Row }) {
  return (
    <span className="tabular-nums" data-total>
      {row.total === null ? "–" : formatScore(row.total)}
      {row.grade ? <strong className="ml-2" data-grade>{row.grade}</strong> : null}
    </span>
  );
}

/** M09 · FR-09.3 — ตารางผู้เรียน × รายการ · จอกว้างเป็นตาราง (คอลัมน์ชื่อตรึงซ้าย) จอแคบเป็นการ์ดรายคน */
export function GradebookGrid({ data }: { data: Gradebook }) {
  const { items, rows } = data;

  return (
    <>
      {/* จอ md ขึ้นไป — ตารางกว้างอยู่ใน overflow ของตัวเอง ไม่ดันความกว้างทั้งหน้า */}
      <div className="bg-card border-border hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <caption className="sr-only">สมุดคะแนน ผู้เรียน × รายการคะแนน</caption>
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="bg-card sticky left-0 z-10 px-3 py-2.5 text-left font-semibold">
                ผู้เรียน
              </th>
              {items.map((item) => (
                <th key={item.id} scope="col" className="px-3 py-2.5 text-left align-bottom font-semibold">
                  <span className="block max-w-[180px] truncate" title={item.title}>
                    {item.title}
                  </span>
                  <span className="text-muted-foreground block text-[11.5px] font-normal">
                    {SOURCE_LABEL[item.source]} · เต็ม {formatScore(item.maxScore)} · {formatScore(item.weight)}%
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                {data.course.mode === GradingMode.PASS_FAIL ? "รวม / ผล" : "รวม / เกรด"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.student.id} data-gradebook-row className="border-line border-b last:border-b-0">
                <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-1.5 text-left font-normal">
                  <span className="block max-w-[200px] truncate font-medium">{row.student.name}</span>
                  <span className="text-muted-foreground block max-w-[200px] truncate text-[11.5px]">
                    {row.student.externalId ?? row.student.email}
                  </span>
                </th>
                {items.map((item) => (
                  <td key={item.id} className="px-3 py-1.5">
                    <GradeCell key={cellKey(item, row)} item={item} row={row} />
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <Total row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* จอแคบ — การ์ดรายคน (ตารางกว้างทำให้เบราว์เซอร์มือถือย่อทั้งหน้า — CLAUDE.md §6) */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.student.id}>
            <article aria-label={row.student.name} data-gradebook-card className="bg-card border-border rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold">{row.student.name}</h2>
                  <p className="text-muted-foreground truncate text-[12px]">{row.student.externalId ?? row.student.email}</p>
                </div>
                <Total row={row} />
              </div>
              <ul className="divide-line mt-2 divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 text-[13px]">
                      <span className="block truncate">{item.title}</span>
                      <span className="text-muted-foreground text-[11.5px]">
                        เต็ม {formatScore(item.maxScore)} · {formatScore(item.weight)}%
                      </span>
                    </span>
                    <GradeCell key={cellKey(item, row)} item={item} row={row} />
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

/** FR-09.5 — ส่งออก CSV (UTF-8 มี BOM) และ Excel */
export function ExportButtons({ courseId }: { courseId: string }) {
  const [pending, setPending] = React.useState<"csv" | "xlsx" | null>(null);

  async function download(format: "csv" | "xlsx") {
    setPending(format);
    try {
      saveBase64(await exportGradebook(courseId, format));
    } catch {
      toast.error("ส่งออกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {(["csv", "xlsx"] as const).map((format) => (
        <Button key={format} type="button" variant="outline" disabled={pending !== null} onClick={() => void download(format)}>
          {pending === format ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {format === "csv" ? "ส่งออก CSV" : "ส่งออก Excel"}
        </Button>
      ))}
    </>
  );
}
