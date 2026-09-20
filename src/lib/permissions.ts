import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Access control ของ Better Auth admin plugin (system-design §4.1)
 * ตั้งแต่ better-auth 1.7 ทุกค่าใน `adminRoles` ต้องมีอยู่ใน `roles` ที่ประกาศไว้
 *
 * ที่นี่ครอบคลุมเฉพาะ statement ของ admin plugin (user/session) เท่านั้น
 * ส่วนขอบเขต "เฉพาะในคณะตนเอง" ยังบังคับที่ `lib/roles.ts` + `lib/rbac.ts` เหมือนเดิม
 * เพราะ AC ของ plugin ไม่รู้จัก departmentId
 */
export const ac = createAccessControl(defaultStatements);

/** ผู้ดูแลระบบสูงสุด — สิทธิ์เต็มตาม matrix */
export const superAdminRole = ac.newRole(adminAc.statements);

/** ผู้ดูแลคณะ — จัดการผู้ใช้ได้ แต่ห้าม impersonate และห้ามลบผู้ใช้ */
export const deptAdminRole = ac.newRole({
  user: ["create", "list", "set-role", "ban", "get", "update", "set-password"],
  session: ["list", "revoke"],
});

/** ผู้สอนและผู้เรียนไม่มีสิทธิ์ในระดับ admin plugin (deny by default · NFR-04) */
export const instructorRole = ac.newRole({ user: [], session: [] });
export const studentRole = ac.newRole({ user: [], session: [] });

export const roles = {
  SUPER_ADMIN: superAdminRole,
  DEPT_ADMIN: deptAdminRole,
  INSTRUCTOR: instructorRole,
  STUDENT: studentRole,
};
