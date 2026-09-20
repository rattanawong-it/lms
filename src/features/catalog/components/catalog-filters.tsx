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
import { CATALOG_SORTS, SORT_LABEL } from "@/features/catalog/schemas";
import type { CatalogFilterOptions } from "@/features/catalog/queries";

/** M03 · FR-03.2 — ค้นหา กรอง และเรียงลำดับคลังคอร์ส (sync กับ query string) */
export function CatalogFilters({ options }: { options: CatalogFilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  const hasFilter =
    Boolean(searchParams.get("q")) ||
    Boolean(searchParams.get("category")) ||
    Boolean(searchParams.get("departmentId")) ||
    Boolean(searchParams.get("level"));

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
      role="search"
      className="bg-card border-border mb-5 grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() || null });
      }}
    >
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="catalog-search" className="text-[12px] font-medium">
          ค้นหาคอร์ส
        </Label>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 my-auto size-4" />
          <Input
            id="catalog-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อคอร์ส หรือคำในคำอธิบาย"
            className="h-10 rounded-lg pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="catalog-sort" className="text-[12px] font-medium">
          เรียงตาม
        </Label>
        <Select
          value={searchParams.get("sort") ?? "newest"}
          onValueChange={(v) => apply({ sort: v === "newest" ? null : v })}
        >
          <SelectTrigger id="catalog-sort" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATALOG_SORTS.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="catalog-category" className="text-[12px] font-medium">
          หมวดหมู่
        </Label>
        <Select
          value={searchParams.get("category") ?? "all"}
          onValueChange={(v) => apply({ category: v })}
        >
          <SelectTrigger id="catalog-category" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
            {options.categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="catalog-department" className="text-[12px] font-medium">
          คณะ / หน่วยงาน
        </Label>
        <Select
          value={searchParams.get("departmentId") ?? "all"}
          onValueChange={(v) => apply({ departmentId: v })}
        >
          <SelectTrigger id="catalog-department" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกคณะ</SelectItem>
            {options.departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="catalog-level" className="text-[12px] font-medium">
          ระดับ
        </Label>
        <Select
          value={searchParams.get("level") ?? "all"}
          onValueChange={(v) => apply({ level: v })}
        >
          <SelectTrigger id="catalog-level" className="h-10 w-full rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกระดับ</SelectItem>
            {options.levels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end gap-2 lg:col-span-2">
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
