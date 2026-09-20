import { describe, expect, it } from "vitest";
import { canAssignRole, isAtLeast, ROLE_LABEL, userScopeWhere } from "@/lib/roles";
import type { SessionUser } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";

function user(role: Role, departmentId: string | null = null): SessionUser {
  return {
    id: `u-${role}`,
    name: role,
    email: `${role}@krirk.ac.th`,
    image: null,
    role,
    departmentId,
    banned: false,
    emailVerified: true,
  };
}

const superAdmin = user(Role.SUPER_ADMIN);
const deptAdmin = user(Role.DEPT_ADMIN, "dept-sci");
const instructor = user(Role.INSTRUCTOR, "dept-sci");
const student = user(Role.STUDENT, "dept-sci");

describe("isAtLeast", () => {
  it("เทียบตามลำดับสิทธิ์ STUDENT < INSTRUCTOR < DEPT_ADMIN < SUPER_ADMIN", () => {
    expect(isAtLeast(superAdmin, Role.DEPT_ADMIN)).toBe(true);
    expect(isAtLeast(deptAdmin, Role.DEPT_ADMIN)).toBe(true);
    expect(isAtLeast(instructor, Role.DEPT_ADMIN)).toBe(false);
    expect(isAtLeast(student, Role.INSTRUCTOR)).toBe(false);
  });
});

describe("canAssignRole (system-design §4.1)", () => {
  it("SUPER_ADMIN เปลี่ยนได้ทุกบทบาท", () => {
    const target = { role: Role.STUDENT, departmentId: "dept-bus" };
    expect(canAssignRole(superAdmin, target, Role.SUPER_ADMIN)).toBe(true);
  });

  it("DEPT_ADMIN เปลี่ยนคนในคณะตนเองได้สูงสุดแค่ INSTRUCTOR", () => {
    const target = { role: Role.STUDENT, departmentId: "dept-sci" };
    expect(canAssignRole(deptAdmin, target, Role.INSTRUCTOR)).toBe(true);
    expect(canAssignRole(deptAdmin, target, Role.DEPT_ADMIN)).toBe(false);
  });

  it("DEPT_ADMIN แตะคนนอกคณะไม่ได้", () => {
    const target = { role: Role.STUDENT, departmentId: "dept-bus" };
    expect(canAssignRole(deptAdmin, target, Role.INSTRUCTOR)).toBe(false);
  });

  it("DEPT_ADMIN ลดสิทธิ์ผู้ดูแลคณะคนอื่นไม่ได้", () => {
    const target = { role: Role.DEPT_ADMIN, departmentId: "dept-sci" };
    expect(canAssignRole(deptAdmin, target, Role.STUDENT)).toBe(false);
  });

  it("INSTRUCTOR และ STUDENT เปลี่ยนบทบาทใครไม่ได้เลย (deny by default)", () => {
    const target = { role: Role.STUDENT, departmentId: "dept-sci" };
    expect(canAssignRole(instructor, target, Role.STUDENT)).toBe(false);
    expect(canAssignRole(student, target, Role.STUDENT)).toBe(false);
  });
});

describe("userScopeWhere", () => {
  it("SUPER_ADMIN เห็นทุกคณะ", () => {
    expect(userScopeWhere(superAdmin)).toEqual({});
  });

  it("DEPT_ADMIN ถูกจำกัดที่คณะตนเอง", () => {
    expect(userScopeWhere(deptAdmin)).toEqual({ departmentId: "dept-sci" });
  });

  it("บทบาทอื่นถูกปิดกั้นทั้งหมด", () => {
    expect(userScopeWhere(instructor).departmentId).toBe("__no_access__");
    expect(userScopeWhere(student).departmentId).toBe("__no_access__");
  });

  it("DEPT_ADMIN ที่ยังไม่สังกัดคณะก็ไม่เห็นข้อมูลใคร", () => {
    expect(userScopeWhere(user(Role.DEPT_ADMIN, null)).departmentId).toBe("__no_access__");
  });
});

describe("ROLE_LABEL", () => {
  it("มีคำแปลภาษาไทยครบทุกบทบาท", () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_LABEL[role]).toBeTruthy();
    }
  });
});
