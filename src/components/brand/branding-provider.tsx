"use client";

import * as React from "react";
import { DEFAULT_BRANDING, type Branding } from "@/features/settings/schemas";

/** FR-17.3 — ชื่อระบบ/โลโก้ที่ผู้ดูแลตั้งไว้ · root layout อ่านจาก DB แล้วส่งลงมาให้ `<Logo>` ทุกจุด */
const BrandingContext = React.createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ value, children }: { value: Branding; children: React.ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return React.useContext(BrandingContext);
}
