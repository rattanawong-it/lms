"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2, MoreHorizontal, ShieldBan, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { assignRole, setUserBanned } from "@/features/users/actions";
import type { UserRow } from "@/features/users/queries";
import { ROLE_LABEL, type SessionUser } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { submitForm } from "@/lib/form";

const ROLE_TONE: Record<Role, string> = {
  SUPER_ADMIN: "bg-danger-bg text-danger-fg",
  DEPT_ADMIN: "bg-quiz-bg text-quiz-fg",
  INSTRUCTOR: "bg-accent text-accent-foreground",
  STUDENT: "bg-muted text-fg-3",
};

type DialogState =
  | { mode: "closed" }
  | { mode: "role"; row: UserRow }
  | { mode: "ban"; row: UserRow };

/** M02 · FR-02.2 / FR-02.3 / FR-02.4 — ตารางผู้ใช้ + เปลี่ยนบทบาท + ระงับบัญชี */
export function UserTable({
  rows,
  actor,
  departments,
  page,
  pageCount,
  total,
}: {
  rows: UserRow[];
  actor: SessionUser;
  departments: { id: string; code: string; name: string }[];
  page: number;
  pageCount: number;
  total: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" });
  const [pending, startTransition] = React.useTransition();

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  function submit(formData: FormData, kind: "role" | "ban") {
    startTransition(async () => {
      const result = await (kind === "role" ? assignRole(formData) : setUserBanned(formData));
      if (result.ok) {
        toast.success(result.message);
        setDialog({ mode: "closed" });
      } else {
        toast.error(result.message);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="ไม่พบผู้ใช้ตามเงื่อนไขที่เลือก"
        description="ลองล้างตัวกรอง หรือเพิ่มผู้ใช้เข้าระบบด้วยการนำเข้าไฟล์ CSV"
        action={
          <Button asChild>
            <Link href="/admin/users/import">นำเข้าผู้ใช้จาก CSV</Link>
          </Button>
        }
      />
    );
  }

  const target = dialog.mode !== "closed" ? dialog.row : null;

  return (
    <>
      <div className="bg-card border-border overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <caption className="sr-only">รายชื่อผู้ใช้ในระบบ</caption>
            <thead className="bg-background border-line text-muted-foreground border-b">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">ผู้ใช้</th>
                <th scope="col" className="px-4 py-3 font-medium">บทบาท</th>
                <th scope="col" className="px-4 py-3 font-medium">คณะ / หน่วยงาน</th>
                <th scope="col" className="px-4 py-3 font-medium">สถานะ</th>
                <th scope="col" className="px-4 py-3 font-medium">สมัครเมื่อ</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-line border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {row.image ? <AvatarImage src={row.image} alt="" /> : null}
                        <AvatarFallback className="bg-muted text-[11px] font-semibold">
                          {row.name.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="text-muted-foreground num truncate text-[11.5px]">
                          {row.email}
                          {row.externalId ? ` · ${row.externalId}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={ROLE_TONE[row.role]} variant="secondary">
                      {ROLE_LABEL[row.role]}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">{row.departmentName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.banned ? (
                      <span className="text-danger-fg font-medium">ถูกระงับ</span>
                    ) : row.emailVerified ? (
                      <span className="text-success-fg font-medium">ใช้งานได้</span>
                    ) : (
                      <span className="text-warning-fg font-medium">รอยืนยันอีเมล</span>
                    )}
                  </td>
                  <td className="num text-muted-foreground px-4 py-3">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`จัดการ ${row.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ mode: "role", row })}>
                          <UserCog className="size-4" /> เปลี่ยนบทบาท / คณะ
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setDialog({ mode: "ban", row })}
                          variant={row.banned ? "default" : "destructive"}
                          disabled={row.id === actor.id}
                        >
                          {row.banned ? (
                            <>
                              <ShieldCheck className="size-4" /> เปิดใช้งานบัญชี
                            </>
                          ) : (
                            <>
                              <ShieldBan className="size-4" /> ระงับบัญชี
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <nav
        aria-label="แบ่งหน้ารายชื่อผู้ใช้"
        className="mt-4 flex items-center justify-between gap-3"
      >
        <p className="text-muted-foreground text-[12.5px]">
          ทั้งหมด <span className="num font-medium">{total.toLocaleString("th-TH")}</span> รายชื่อ ·
          หน้า {page} จาก {pageCount}
        </p>
        <div className="flex gap-2">
          <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
            {page > 1 ? <Link href={pageHref(page - 1)}>ก่อนหน้า</Link> : <span>ก่อนหน้า</span>}
          </Button>
          <Button asChild={page < pageCount} variant="outline" size="sm" disabled={page >= pageCount}>
            {page < pageCount ? <Link href={pageHref(page + 1)}>ถัดไป</Link> : <span>ถัดไป</span>}
          </Button>
        </div>
      </nav>

      {/* FR-02.3 — เปลี่ยนบทบาท/คณะ */}
      <Dialog
        open={dialog.mode === "role"}
        onOpenChange={(open) => (open ? null : setDialog({ mode: "closed" }))}
      >
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={submitForm((fd) => submit(fd, "role"))}>
            <DialogHeader>
              <DialogTitle>เปลี่ยนบทบาทและคณะ</DialogTitle>
              <DialogDescription>
                {actor.role === Role.DEPT_ADMIN
                  ? "ผู้ดูแลคณะเปลี่ยนได้เฉพาะผู้ใช้ในคณะตนเอง และสูงสุดแค่ผู้สอน"
                  : "ผู้ดูแลระบบสูงสุดกำหนดบทบาทและคณะได้ทุกระดับ"}
              </DialogDescription>
            </DialogHeader>

            {target ? (
              <div className="space-y-4 py-4">
                <input type="hidden" name="userId" value={target.id} />
                <p className="bg-muted rounded-lg px-3 py-2.5 text-[13px]">
                  <span className="font-medium">{target.name}</span>
                  <span className="text-muted-foreground num block text-[11.5px]">
                    {target.email}
                  </span>
                </p>

                <div className="space-y-[7px]">
                  <Label htmlFor="role-select" className="text-[12.5px] font-medium">
                    บทบาท
                  </Label>
                  <Select name="role" defaultValue={target.role}>
                    <SelectTrigger id="role-select" className="bg-card h-11 w-full rounded-[9px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Role)
                        .filter((role) =>
                          actor.role === Role.SUPER_ADMIN
                            ? true
                            : role === Role.STUDENT || role === Role.INSTRUCTOR,
                        )
                        .map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {actor.role === Role.SUPER_ADMIN ? (
                  <div className="space-y-[7px]">
                    <Label htmlFor="dept-select" className="text-[12.5px] font-medium">
                      คณะ / หน่วยงาน
                    </Label>
                    <Select name="departmentId" defaultValue={target.departmentId ?? "none"}>
                      <SelectTrigger id="dept-select" className="bg-card h-11 w-full rounded-[9px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">ไม่สังกัดคณะ</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.code} · {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ mode: "closed" })}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                บันทึก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FR-02.4 — ระงับ/เปิดใช้งานบัญชี */}
      <Dialog
        open={dialog.mode === "ban"}
        onOpenChange={(open) => (open ? null : setDialog({ mode: "closed" }))}
      >
        <DialogContent className="sm:max-w-[420px]">
          <form action={(fd) => submit(fd, "ban")}>
            <DialogHeader>
              <DialogTitle>{target?.banned ? "เปิดใช้งานบัญชี" : "ระงับบัญชี"}</DialogTitle>
              <DialogDescription>
                {target?.banned
                  ? `${target.name} จะกลับมาเข้าสู่ระบบได้ตามปกติ`
                  : `${target?.name ?? ""} จะถูกตัดออกจากทุกอุปกรณ์ทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง`}
              </DialogDescription>
            </DialogHeader>

            {target ? (
              <div className="space-y-4 py-4">
                <input type="hidden" name="userId" value={target.id} />
                <input type="hidden" name="banned" value={target.banned ? "" : "true"} />
                {!target.banned ? (
                  <Field
                    label="เหตุผล (บันทึกใน Audit Log)"
                    name="reason"
                    placeholder="เช่น ละเมิดข้อกำหนดการใช้งาน"
                  />
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ mode: "closed" })}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant={target?.banned ? "default" : "destructive"}
                disabled={pending}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {target?.banned ? "เปิดใช้งาน" : "ระงับบัญชี"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
