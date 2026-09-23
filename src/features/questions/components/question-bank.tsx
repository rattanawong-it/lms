"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Pencil,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { EmptyState } from "@/components/shared/empty-state";
import { RichText } from "@/components/shared/rich-text";
import { QuestionType } from "@/generated/prisma/enums";
import { formatScore } from "@/lib/decimal";
import { submitForm } from "@/lib/form";
import { cn } from "@/lib/utils";
import { setQuestionArchived } from "@/features/questions/actions";
import { QUESTION_TYPE_LABEL, type QuestionFilter } from "@/features/questions/schemas";
import type { BankQuestion } from "@/features/questions/queries";
import { QuestionEditor } from "@/features/questions/components/question-editor";
import { QuestionImport } from "@/features/questions/components/question-import";

const ALL = "__all__";

/** สรุปเฉลยสั้น ๆ ใต้โจทย์ — ให้ผู้สอนตรวจทานได้โดยไม่ต้องเปิดแก้ */
function AnswerSummary({ q }: { q: BankQuestion }) {
  if (q.type === QuestionType.ESSAY) {
    return <p className="text-muted-foreground text-[12.5px]">ตรวจเองหลังผู้เรียนส่ง</p>;
  }
  if (q.type === QuestionType.MATCHING) {
    return (
      <ul className="space-y-0.5 text-[12.5px]">
        {q.choices.map((c) => (
          <li key={c.id}>
            {c.text} <span className="text-muted-foreground">→</span> {c.matchKey}
          </li>
        ))}
      </ul>
    );
  }
  if (q.type === QuestionType.SHORT_TEXT) {
    return (
      <p className="text-[12.5px]">
        <span className="text-muted-foreground">คำตอบที่ยอมรับ: </span>
        {q.choices.map((c) => c.text).join(" · ")}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-[12.5px]">
      {q.choices.map((c) => (
        <li key={c.id} className={cn("flex items-start gap-1.5", c.isCorrect ? "text-success-fg font-medium" : "text-fg-2")}>
          {c.isCorrect ? (
            <Check className="mt-0.5 size-3.5 shrink-0" aria-label="คำตอบที่ถูก" />
          ) : (
            <span className="size-3.5 shrink-0" aria-hidden />
          )}
          {c.text}
        </li>
      ))}
    </ul>
  );
}

type DialogState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; question: BankQuestion }
  | { kind: "import" };

/** M07 · FR-07.1 / FR-07.2 / FR-07.7 — คลังข้อสอบของคอร์ส */
export function QuestionBank({
  courseId,
  questions,
  tags,
  filter,
  total,
  activeCount,
  archivedCount,
  page,
  pageCount,
}: {
  courseId: string;
  questions: BankQuestion[];
  tags: string[];
  filter: QuestionFilter;
  total: number;
  activeCount: number;
  archivedCount: number;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "closed" });
  const [pending, startTransition] = React.useTransition();

  /** เปลี่ยนตัวกรองแล้วกลับไปหน้าแรกเสมอ */
  function hrefWith(change: Partial<Record<"q" | "type" | "tag" | "archived" | "page", string | null>>) {
    const params = new URLSearchParams();
    const next = {
      q: filter.q || null,
      type: filter.type ?? null,
      tag: filter.tag ?? null,
      archived: filter.archived ? "1" : null,
      page: null as string | null,
      ...change,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const go = (change: Parameters<typeof hrefWith>[0]) =>
    router.push(hrefWith(change) as Parameters<typeof router.push>[0]);

  function archive(formData: FormData) {
    startTransition(async () => {
      const result = await setQuestionArchived(formData);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  const close = () => setDialog({ kind: "closed" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="สถานะข้อสอบ" className="bg-muted flex rounded-lg p-1">
          {(
            [
              [false, `ใช้งาน (${activeCount})`],
              [true, `เก็บเข้าคลังเก่า (${archivedCount})`],
            ] as const
          ).map(([archived, label]) => (
            <Link
              key={label}
              href={hrefWith({ archived: archived ? "1" : null }) as Parameters<typeof router.push>[0]}
              aria-current={filter.archived === archived ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-md px-3.5 text-[13px] font-medium transition-colors",
                filter.archived === archived
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setDialog({ kind: "import" })}>
            <Upload className="size-4" /> นำเข้า CSV / Excel
          </Button>
          <Button type="button" onClick={() => setDialog({ kind: "create" })}>
            <Plus className="size-4" /> เพิ่มข้อสอบ
          </Button>
        </div>
      </div>

      <form
        role="search"
        onSubmit={submitForm((fd) => go({ q: String(fd.get("q") ?? "").trim() || null }))}
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]"
      >
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={filter.q}
            placeholder="ค้นหาในโจทย์หรือแท็ก แล้วกด Enter"
            aria-label="ค้นหาข้อสอบ"
            className="bg-card h-11 rounded-[9px] pl-9"
          />
        </div>
        <Select value={filter.type ?? ALL} onValueChange={(v) => go({ type: v === ALL ? null : v })}>
          <SelectTrigger aria-label="กรองตามชนิด" className="bg-card h-11 w-full rounded-[9px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกชนิด</SelectItem>
            {Object.values(QuestionType).map((t) => (
              <SelectItem key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.tag ?? ALL} onValueChange={(v) => go({ tag: v === ALL ? null : v })}>
          <SelectTrigger aria-label="กรองตามแท็ก" className="bg-card h-11 w-full rounded-[9px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกแท็ก</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>

      {questions.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="size-5" />}
          title={
            filter.q || filter.type || filter.tag
              ? "ไม่พบข้อสอบที่ตรงกับตัวกรอง"
              : filter.archived
                ? "ไม่มีข้อสอบที่เก็บเข้าคลังเก่า"
                : "ยังไม่มีข้อสอบในคลัง"
          }
          description={
            filter.archived
              ? undefined
              : "เพิ่มทีละข้อ หรือนำเข้าจากไฟล์ Excel/CSV ตามแม่แบบของระบบ — รองรับ 6 ชนิด"
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-[12.5px]">พบ {total.toLocaleString("th-TH")} ข้อ</p>
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id}>
                <article
                  aria-label={`ข้อสอบ ${QUESTION_TYPE_LABEL[q.type]}`}
                  data-question
                  className="bg-card border-border rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-accent text-accent-foreground border-0">
                      {QUESTION_TYPE_LABEL[q.type]}
                    </Badge>
                    <Badge variant="outline">{formatScore(q.points)} คะแนน</Badge>
                    {q.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                    {q.answerCount > 0 ? (
                      <span className="text-muted-foreground ml-auto text-[11.5px]">
                        มีผู้ตอบแล้ว {q.answerCount} ครั้ง
                      </span>
                    ) : null}
                  </div>

                  <RichText content={q.prompt} className="mt-3 space-y-2" />
                  <div className="mt-2.5">
                    <AnswerSummary q={q} />
                  </div>

                  <div className="border-line mt-3 flex flex-wrap gap-2 border-t pt-3">
                    {q.archived ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog({ kind: "edit", question: q })}
                      >
                        <Pencil className="size-3.5" /> แก้ไข
                      </Button>
                    )}
                    <form onSubmit={submitForm(archive)}>
                      <input type="hidden" name="id" value={q.id} />
                      <input type="hidden" name="archived" value={q.archived ? "false" : "true"} />
                      <Button type="submit" variant="outline" size="sm" disabled={pending}>
                        {q.archived ? (
                          <>
                            <ArchiveRestore className="size-3.5" /> นำกลับมาใช้
                          </>
                        ) : (
                          <>
                            <Archive className="size-3.5" /> เก็บเข้าคลังเก่า
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav aria-label="เลือกหน้า" className="flex items-center justify-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith({ page: String(page - 1) }) as Parameters<typeof router.push>[0]}>
                    <ChevronLeft className="size-4" /> ก่อนหน้า
                  </Link>
                </Button>
              ) : null}
              <span className="text-muted-foreground text-[12.5px]">
                หน้า {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith({ page: String(page + 1) }) as Parameters<typeof router.push>[0]}>
                    ถัดไป <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </>
      )}

      <Dialog open={dialog.kind !== "closed"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === "import"
                ? "นำเข้าข้อสอบจากไฟล์"
                : dialog.kind === "edit"
                  ? "แก้ไขข้อสอบ"
                  : "เพิ่มข้อสอบ"}
            </DialogTitle>
            <DialogDescription>
              {dialog.kind === "import"
                ? "ระบบตรวจทุกแถวก่อน — นำเข้าเมื่อไม่มีแถวที่ผิดเลยเท่านั้น"
                : "ข้อสอบในคลังนำไปใช้ในแบบทดสอบของคอร์สนี้ได้หลายชุด"}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind === "import" ? (
            <QuestionImport courseId={courseId} onDone={close} />
          ) : dialog.kind === "create" ? (
            <QuestionEditor courseId={courseId} onDone={close} />
          ) : dialog.kind === "edit" ? (
            <QuestionEditor key={dialog.question.id} courseId={courseId} question={dialog.question} onDone={close} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
