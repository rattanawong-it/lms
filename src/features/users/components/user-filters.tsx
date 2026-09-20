"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<string, string> = {
  all: "ทุกสถานะ",
  active: "ใช้งานได้",
  banned: "ถูกระงับ",
  unverified: "ยังไม่ยืนยันอีเมล",
};

/** FR-02.2 — แถบค้นหาและตัวกรองรายการผู้ใช้ (sync กับ query string) */
export function UserFilters({
  departments,
  canFilterDepartment,
}: {
  departments: { id: string; code: string; name: string }[];
  canFilterDepartment: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  const hasFilter =
    Boolean(searchParams.get("q")) ||
    Boolean(searchParams.get("role")) ||
    Boolean(searchParams.get("departmentId")) ||
    (searchParams.get("status") ?? "all") !== "all";

  function apply(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === "all") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      className="bg-card border-border mb-4 grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() || null });
      }}
      role="search"
    >
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="user-search" className="text-[12px] font-medium">
          ค้นหา
        </Label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 my-auto size-4" />
          <Input
            id="user-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อ อีเมล หรือรหัสนักศึกษา/พนักงาน"
            className="h-10 rounded-lg pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="user-role" className="text-[12px] font-medium">
          บทบาท
        </Label>
        <Select
          value={searchParams.get("role") ?? "all"}
          onValueChange={(v) => apply({ role: v })}
        >
          <SelectTrigger id="user-role" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกบทบาท</SelectItem>
            {Object.values(Role).map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="user-status" className="text-[12px] font-medium">
          สถานะ
        </Label>
        <Select
          value={searchParams.get("status") ?? "all"}
          onValueChange={(v) => apply({ status: v })}
        >
          <SelectTrigger id="user-status" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canFilterDepartment ? (
        <div className="space-y-1.5">
          <Label htmlFor="user-dept" className="text-[12px] font-medium">
            คณะ / หน่วยงาน
          </Label>
          <Select
            value={searchParams.get("departmentId") ?? "all"}
            onValueChange={(v) => apply({ departmentId: v })}
          >
            <SelectTrigger id="user-dept" className="h-10 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกคณะ</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Button type="submit" size="lg" className="h-10">
          ค้นหา
        </Button>
        {hasFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-10"
            onClick={() => {
              setQ("");
              router.push(pathname);
            }}
          >
            <X className="size-4" /> ล้างตัวกรอง
          </Button>
        ) : null}
      </div>
    </form>
  );
}
