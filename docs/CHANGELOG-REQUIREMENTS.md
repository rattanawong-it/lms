# Requirements Change Log

> ทุกการเปลี่ยนแปลง requirement, schema, โครงสร้าง หรือ tech stack ต้อง**แจ้งและได้รับอนุมัติก่อน**จึงจะบันทึกที่นี่ได้

| # | วันที่ | เอกสาร/ส่วน | การเปลี่ยนแปลง | เหตุผล | ผลกระทบ | สถานะ / ผู้อนุมัติ |
|---|---|---|---|---|---|---|
| 0 | 2026-09-19 | spec.md, system-design.md | สร้าง baseline v1.0 จากการสัมภาษณ์ requirements | เริ่มโครงการ | — | รอตรวจ |
| 1 | 2026-09-20 | system-design §11 | เพิ่ม `src/lib/roles.ts` (ส่วน RBAC ที่ client ใช้ร่วมได้) และให้ `lib/rbac.ts` re-export ต่อ | Client component ห้าม import โมดูล `server-only` — ทำให้ `pg`/`next/headers` หลุดเข้า browser bundle และ build ล้มทั้งหมด | โครงสร้าง `lib/` เพิ่ม 1 ไฟล์ · จุดตรวจสิทธิ์ยังอยู่ที่ `rbac.ts` เหมือนเดิม | อนุมัติแล้ว |
| 2 | 2026-09-20 | system-design §4.1, §11 | เพิ่ม `src/lib/permissions.ts` ประกาศ access control 4 บทบาทให้ Better Auth admin plugin | better-auth 1.7 บังคับว่าทุกค่าใน `adminRoles` ต้องมีใน `roles` มิฉะนั้น throw ตอน init | ไม่เปลี่ยน permission matrix — เป็นการเขียน matrix เดิมให้ plugin รู้จัก | อนุมัติแล้ว |
| 3 | 2026-09-20 | system-design §10.1 | เพิ่ม env `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | ใช้กำหนดบัญชี Super Admin ตั้งต้นของ `prisma/seed.ts` โดยไม่ hardcode รหัสผ่าน | เพิ่ม 2 ตัวแปรใน `.env.example` | อนุมัติแล้ว |
| 4 | 2026-09-20 | system-design §11, §9 | เพิ่ม `tests/unit/`, `tests/e2e/`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` | ปิดงาน §12 ข้อ 4 (CI: lint, typecheck, test) ก่อนเริ่ม Phase 1 | เพิ่มขั้นตอน CI บน push/PR | อนุมัติแล้ว |
| 5 | 2026-09-20 | โครงสร้างโปรเจกต์ | `.gitignore`: ยกเว้น `.env.example` ออกจาก `.env*` และ ignore `/src/generated` · ESLint ignore `project-ui/**`, `src/generated/**` | `.env*` กลืน `.env.example` ทำให้ commit ไม่ได้ ขัดกับ §9 (Secrets) · ไฟล์จาก design tool และ Prisma client ไม่ควรถูก lint | `.env.example` เข้า repo ได้ · lint เหลือ 0 error | อนุมัติแล้ว |
