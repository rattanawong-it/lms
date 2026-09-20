import type { Role } from "@/generated/prisma/enums";

/** โครงเมนูหลักของระบบ — ใช้ร่วมกันระหว่าง top bar (เดสก์ท็อป) และ bottom nav (มือถือ) */
export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "book" | "bell" | "user" | "teach" | "admin";
  /** role ที่เห็นเมนูนี้ — ไม่ระบุ = ทุก role ที่ login แล้ว */
  roles?: Role[];
};

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "หน้าหลัก", icon: "home" },
  { href: "/my-courses", label: "คอร์สของฉัน", icon: "book" },
  { href: "/courses", label: "คลังคอร์ส", icon: "book" },
  { href: "/teach", label: "ห้องผู้สอน", icon: "teach", roles: ["INSTRUCTOR", "DEPT_ADMIN", "SUPER_ADMIN"] },
  { href: "/admin", label: "ผู้ดูแล", icon: "admin", roles: ["DEPT_ADMIN", "SUPER_ADMIN"] },
];

/** NFR-01 · แถบล่างบนมือถือ 4 เมนู (system-design §8.1) */
export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "หน้าหลัก", icon: "home" },
  { href: "/my-courses", label: "คอร์สของฉัน", icon: "book" },
  { href: "/notifications", label: "แจ้งเตือน", icon: "bell" },
  { href: "/settings/profile", label: "โปรไฟล์", icon: "user" },
];

export function visibleNav(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}
