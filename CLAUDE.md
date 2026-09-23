# CLAUDE.md — สมองของโปรเจกต์

> ไฟล์นี้คือ **FR-00.1** ใน [`docs/spec.md`](./docs/spec.md) §M00
> อ่านไฟล์นี้ให้จบก่อนเริ่มงานทุกครั้ง และ **อัปเดตในคอมมิตเดียวกัน**
> เมื่อ convention, คำสั่ง, โครงสร้างโฟลเดอร์ หรือข้อควรระวังเปลี่ยน (FR-00.5)

@AGENTS.md

---

## 1. บริบท (Context)

**Krirk LMS** — ระบบบริหารจัดการการเรียนรู้ที่ใช้ 2 รูปแบบในระบบเดียว
1. **ภายในสถาบัน** — นักศึกษา/บุคลากรเรียนรายวิชาที่คณะเปิดสอน (คอร์ส `INTERNAL`)
2. **คอร์สสาธารณะ** — บุคคลภายนอกสมัครเรียน (คอร์ส `PUBLIC`) เฟส 1 ฟรีทั้งหมด การชำระเงินอยู่เฟส 4

| | |
|---|---|
| บทบาทผู้ใช้ | `SUPER_ADMIN` · `DEPT_ADMIN` · `INSTRUCTOR` · `STUDENT` (+ ผู้เยี่ยมชมที่ไม่ login) |
| สถานะปัจจุบัน | Phase 1 (MVP) — **จบครบ 7 ขั้น** (2026-09-23) · งานถัดไปคือ Phase 2 (M07–M10) บน branch `phase-2` |
| ภาษา UI | **ภาษาไทยทั้งหมด** รวมข้อความ error และ validation · วันที่แสดงเป็น พ.ศ. (เก็บ UTC แสดง Asia/Bangkok) |
| จุดขายที่ห้ามพลาด | การป้องกันการ capture เนื้อหา (M15) — watermark, signed URL อายุสั้น, ไม่มีปุ่มดาวน์โหลดวิดีโอ/PDF |

## 2. เอกสารที่เป็นแหล่งความจริง

| ไฟล์ | ใช้ตอบคำถามว่า |
|---|---|
| [`docs/spec.md`](./docs/spec.md) | ต้องทำอะไร (FR/NFR, checklist รายโมดูล, สถานะงาน §3.0.1, roadmap) |
| [`docs/system-design.md`](./docs/system-design.md) | ทำอย่างไร (สถาปัตยกรรม, data model, authorization, flow, โครงสร้างโฟลเดอร์ §11) |
| [`docs/phase-2-plan.md`](./docs/phase-2-plan.md) | ลำดับงานของเฟสปัจจุบัน (Phase 2 — อนุมัติแล้ว 2026-09-23) + จุดหยุดตรวจ · แผนเฟสก่อนหน้าอยู่ `phase-1-plan.md` |
| [`docs/CHANGELOG-REQUIREMENTS.md`](./docs/CHANGELOG-REQUIREMENTS.md) | อะไรเปลี่ยนไปจาก baseline เพราะอะไร |

**กฎการเปลี่ยนแปลง:** แก้ requirement, Prisma schema, โครงสร้างโฟลเดอร์ หรือ tech stack
→ **แจ้งเจ้าของระบบและรอคำยืนยันก่อน** แล้วบันทึกลง `CHANGELOG-REQUIREMENTS.md` (วันที่, สิ่งที่เปลี่ยน, เหตุผล, ผลกระทบ, ผู้อนุมัติ)
ลำดับการทำงานคือ **spec → system-design → ให้ตรวจ → ลงมือเขียนโค้ด** เสมอ

## 3. คำสั่งที่ใช้บ่อย

```bash
pnpm db:up          # docker compose: postgres + minio + mailpit
pnpm storage:init   # สร้าง bucket ใน MinIO (รันครั้งแรก / หลัง db:reset)
pnpm dev            # next dev (Turbopack)

pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run  (tests/unit)
pnpm test:e2e --workers=2   # playwright (tests/e2e) — ค่าเริ่มต้น 5 workers หนักเกินเครื่องพัฒนา
npx next typegen    # สร้าง type ของ route ใหม่ ก่อน typecheck จะผ่าน

pnpm db:migrate     # prisma migrate dev
pnpm db:generate    # prisma generate → src/generated/prisma
pnpm db:seed        # prisma/seed.ts  (ใช้ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
pnpm db:reset       # ล้าง DB + migrate + seed
pnpm db:studio
```

**ก่อนคอมมิตทุกครั้ง:** `pnpm lint && pnpm typecheck && pnpm test` (CI รันชุดเดียวกันใน `.github/workflows/ci.yml`)
บริการท้องถิ่น: Postgres `5432` · MinIO `9000` (คอนโซล `9001`) · Mailpit `8025` (อ่านอีเมลยืนยัน/รีเซ็ตรหัสผ่าน)

## 4. สถาปัตยกรรมย่อ

- **Next.js 16 App Router + React 19 + TypeScript strict** — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนของใหม่ (ดู AGENTS.md ด้านบน)
- **Prisma 7 + PostgreSQL** ผ่าน `@prisma/adapter-pg` · client ถูก generate ไปที่ `src/generated/prisma` (import จาก `@/generated/prisma/client` และ `@/generated/prisma/enums` ไม่ใช่ `@prisma/client`)
- **Better Auth** (Google OAuth + Email/Password) · cookie prefix `krirk-lms` · route `/api/auth/[...all]`
- **Tailwind v4 + shadcn/ui** (`src/components/ui`) · ฟอนต์ **Anuphan** (ไทย) + **Inter** (อังกฤษ/ตัวเลข) + **JetBrains Mono** (โค้ด) ประกาศเป็น `--font-sans` / `--font-mono` ใน `globals.css`
- **S3-compatible storage** — MinIO ตอนพัฒนา, Cloudflare R2 ตอน deploy โดยเปลี่ยนแค่ env `S3_*` (D-01)
- **ตรวจสิทธิ์ 2 ชั้น:** `proxy.ts` เช็คแค่ว่ามี session cookie (optimistic, ไม่ query DB) → สิทธิ์จริงตรวจซ้ำใน Data Access Layer ทุกครั้ง (NFR-04 deny by default)
- **CSP อยู่ใน `proxy.ts`** (nonce ใหม่ทุก request ตามคู่มือ Next 16) ส่วน security header คงที่อยู่ใน `next.config.ts`
  จะฝัง iframe, โหลดสคริปต์ หรือเสิร์ฟสื่อจากโดเมนใหม่ **ต้องแก้ `buildCsp()` ด้วยเสมอ** ไม่งั้นเบราว์เซอร์บล็อกเงียบ ๆ

```
src/
  app/(public) (auth) (learn) (instructor) (admin)   หน้าเว็บ แยกตามกลุ่มผู้ใช้
    (learn)/learn/[courseId]/[lessonId]              หน้าเรียน (สารบัญ + สื่อ + ProtectedViewer)
  app/api/{auth,health,media,upload}                 route handler
  app/api/{lesson-media,lesson-file,events/screen}   เสิร์ฟ PDF · ไฟล์ประกอบ · รับรายงานหน้าจอ
  app/api/submission-file                            เสิร์ฟไฟล์งานที่ผู้เรียนส่ง (เจ้าของ/ผู้สอนของคอร์ส)
  app/(learn)/{announcements,notifications}           ผู้รับอ่านประกาศ · หน้ารวมการแจ้งเตือน (M11)
  components/protected-viewer/                       M15 — กล่องครอบเนื้อหา + ลายน้ำ + ตัวดักเหตุการณ์
  features/<feature>/  queries.ts · actions.ts · schemas.ts · components/ · lib/
  components/  ui (shadcn) · shared · layout · editor · brand
  lib/         โครงพื้นฐานที่ใช้ร่วมกันทุกฟีเจอร์
  generated/prisma/                                   ผลจาก prisma generate (ห้ามแก้มือ)
prisma/ schema.prisma · migrations · seed.ts
tests/  unit (Vitest) · e2e (Playwright)
docs/   spec · system-design · phase-1-plan · CHANGELOG-REQUIREMENTS
```

### `src/lib/` มีอะไรบ้าง
| ไฟล์ | หน้าที่ |
|---|---|
| `db.ts` | Prisma client ตัวเดียวของทั้งแอป |
| `rbac.ts` (server) | `getSessionUser` · `requireUser` · `requireRole` · `requireAtLeast` · `requireApiUser` · `assertCourseAccess(courseId, "learn"\|"teach"\|"manage")` |
| `roles.ts` (client ใช้ได้) | `SessionUser` · `ROLE_RANK` · `ROLE_LABEL` · `isAtLeast` · `canAssignRole` · `userScopeWhere` |
| `permissions.ts` | access control matrix ให้ Better Auth admin plugin |
| `action-result.ts` | `ActionResult` + `zodToFieldErrors` |
| `form.ts` (client) | `submitForm()` — ใช้แทน `<form action={}>` |
| `storage.ts` | ที่เดียวที่รู้จัก endpoint/bucket · presign PUT/GET, multipart, stream, delete · `READ_URL_TTL_SECONDS = 5 นาที` |
| `upload-limits.ts` | `UPLOAD_RULES` ต่อ `AssetKind`, เพดานขนาด, `checkUpload()` |
| `file-type.ts` | ตรวจ magic bytes ว่า MIME ที่ client แจ้งตรงกับเนื้อไฟล์จริง |
| `object-key.ts` | ตั้ง object key ที่ปลอดภัย |
| `audit.ts` | `writeAudit()` — บันทึก AuditLog |
| `notify/index.ts` | `notify()` — **จุดเดียวที่สร้างการแจ้งเตือน** (in-app ตอนนี้ · อีเมล/LINE เติมที่นี่ในเฟส 3) ไม่ throw |
| `rate-limit.ts` | จำกัดความถี่แบบ fixed window ในหน่วยความจำ (ขอ signed URL, รายงานหน้าจอ) — **นับแยกต่อ process** |
| `dates.ts` | จัดรูปแบบวันที่ไทย (พ.ศ.) |
| `csv.ts` · `xlsx.ts` (server) | ตาราง `string[][]` ↔ CSV (RFC 4180 + BOM) / Excel — ตัวตรวจของฟีเจอร์รับตารางชุดเดียวกันทั้งสองแบบ |
| `decimal.ts` | `toScore()` แปลง `Decimal` ของคะแนนเป็น number ก่อนส่งให้ client · `formatScore()` |
| `mail.ts` · `env.ts` · `rich-text-doc.ts` · `utils.ts` | อีเมล · env ที่ผ่าน Zod · เอกสาร Tiptap แบบ sanitize แล้ว · `cn()` |

## 5. Conventions

**โครงสร้างฟีเจอร์** — งานใหม่ให้สร้าง `src/features/<feature>/`
- `queries.ts` — ขึ้นต้นด้วย `import "server-only";` อ่านข้อมูลอย่างเดียว ตรวจสิทธิ์ด้วย `rbac.ts` ก่อน query ทุกฟังก์ชัน
- `actions.ts` — ขึ้นต้นด้วย `"use server";` เขียนข้อมูล · parse ด้วย Zod → ตรวจสิทธิ์ → เขียน DB → `writeAudit()` → `revalidatePath()` → คืน `ActionResult`
- `schemas.ts` — Zod schema ใช้ร่วม client/server **ข้อความ error เป็นภาษาไทย**
- `components/` — UI ของฟีเจอร์นั้น (ของที่ใช้ข้ามฟีเจอร์ไปอยู่ `src/components/shared`)

**ฟอร์ม** — ใช้ `onSubmit={submitForm(handler)}` จาก `@/lib/form` **ห้ามใช้ `<form action={fn}>`**
(React 19 สั่ง reset ฟอร์มเมื่อ action จบ ค่าที่ผู้ใช้กรอกจะหายทุกครั้งที่บันทึกไม่ผ่าน)
ผลลัพธ์คืนเป็น `ActionResult` แล้วแสดง `fieldErrors` ใต้ช่องที่ผิด + toast (`sonner`) สำหรับผลรวม

**การตรวจสิทธิ์** — ทุก query/action/route handler ต้องเรียก `require*` หรือ `assertCourseAccess` ก่อนแตะข้อมูล
อย่าไว้ใจ `proxy.ts` และอย่าเชื่อ id ที่ส่งมาจาก client โดยไม่ตรวจความเป็นเจ้าของ
action ที่รับ id ลูก (เช่น `lessonId`, `enrollmentId`) ให้ย้อนขึ้นไปหาคอร์สจาก id นั้นแล้วตรวจสิทธิ์ตามคอร์สที่เจอจริง
ไม่ใช่ตามค่า `courseId` ที่ฟอร์มส่งมาคู่กัน (ดู `lessonContext()` ใน `features/enrollment/actions.ts`)

**ความคืบหน้าและวันหมดอายุ (M06)** — สูตรทั้งหมดอยู่ใน `features/enrollment/lib/progress.ts` เป็น pure function
(ไม่มี `server-only` เพราะทั้งสองฝั่งใช้) · แก้ `LessonProgress.completed` เมื่อไรต้องคำนวณ `Enrollment.progressPct`
ใน transaction เดียวกันเสมอ · **ไม่มีงานเปลี่ยน `status` เป็น `EXPIRED` อัตโนมัติ** ทุกที่ที่ตัดสินสิทธิ์ต้องเทียบ
`expiresAt` กับเวลาปัจจุบันเอง (`isExpired()` ใน `features/enrollment/queries.ts` และใน `assertCourseAccess`)

**ความคืบหน้าเขียนผ่าน `writeProgress()` ใน `features/enrollment/lib/progress-writer.ts` เท่านั้น**
(ปุ่มเรียนจบ, วิดีโอ, สอบผ่าน) · รับเป้าหมายเป็น enrollment ตรง ๆ ผู้เรียกต้องตรวจสิทธิ์มาก่อน
สิทธิ์ระดับ `learn` นับทั้ง `ACTIVE` และ `COMPLETED` (ทบทวนหลังเรียนจบได้) ที่ยังไม่หมดอายุ

**แบบทดสอบ (M07)** — ไม่มี cron: attempt ที่เลยเวลาถูกปิดตอนที่ระบบแตะมัน (`closeIfOverdue()`) ทุกที่ที่อ่าน attempt ต้องเรียกก่อน
· query ของหน้าทำข้อสอบห้าม select `isCorrect` / `matchKey` / `explanation` · การตรวจคะแนนเป็น pure function ใน `features/quiz/lib/`
· ผู้สอนให้คะแนน/ความเห็นผ่าน `reviewAnswer()` เท่านั้น — ล็อกแถว attempt แล้วคำนวณผลรวมใหม่ด้วย `recomputeAttempt()` · ผลสอบทั้งฝั่งผู้เรียนและผู้สอนประกอบด้วย `buildItems()` ใน `queries.ts` ตัวเดียว

**งานที่ต้องส่ง (M08)** — กติกาส่ง/ส่งซ้ำ/ส่งช้าอยู่ใน `submitState()` (`features/assignments/lib/rules.ts`) ใช้ทั้งหน้าจอ ด่านอัปโหลด และ action
· เมื่อมีการส่งหลายครั้ง นับ/ตรวจเฉพาะ**ครั้งล่าสุดของแต่ละคน** (`latestPerStudent()`) — ครั้งก่อนเป็นประวัติ

**การแจ้งเตือน (M11)** — เรียก `notify()` จาก `@/lib/notify` เท่านั้น ห้าม `db.notification.create*` เอง
ตัวเลขบนกระดิ่งมาจาก `getUnreadNotificationCount()` ที่ layout `(learn)`/`(instructor)` ส่งให้ `TopBar`/`BottomNav`
ประกาศตรวจสิทธิ์ตามระดับ: `COURSE` → `assertCourseAccess(…, "teach")` · `GLOBAL`/`DEPARTMENT` → `canPostOrgAnnouncement()`
และการแก้/ลบ/ปักหมุดตรวจกับระดับที่บันทึกใน DB ไม่ใช่ค่าจากฟอร์ม

**Client vs Server** — client component ห้าม import โมดูลที่มี `server-only` (เช่น `rbac.ts`, `db.ts`)
ส่วนที่ client ต้องใช้ร่วมให้ไปอยู่ `roles.ts` แล้ว `rbac.ts` re-export ต่อ

**ไฟล์อัปโหลด** — client ขอ presign → อัปโหลดตรงไป storage → `POST /api/upload/complete`
ฝั่ง server ตรวจ `checkUpload()` (ชนิด+ขนาด) และ magic bytes เสมอ · ไฟล์ > 20 MB ใช้ multipart (ชิ้นละ 10 MB)
อัปโหลดทั่วไปเฉพาะผู้สอนขึ้นไป · ผู้เรียนอัปโหลดได้เฉพาะไฟล์ส่งงาน (presign ส่ง `assignmentId` → `authorizeSubmissionUpload()`)
และ MIME ของไฟล์ส่งงานมาจากนามสกุล (`submissionMime()`) ไม่ใช่ `file.type` ที่เบราว์เซอร์เดา

**ไฟล์บทเรียนของผู้เรียน** — ทุกเส้นทางต้องผ่าน `getLessonAccess()` (ตรวจ enrollment + กติกาเรียนตามลำดับ) ก่อนเสมอ
| ชนิด | เส้นทาง | เหตุผล |
|---|---|---|
| วิดีโอ | signed URL ≤ 5 นาที ตรงไป storage · ขอตอนกดเล่น | ไฟล์ถึง 2 GB ไม่ควรวิ่งผ่านเซิร์ฟเวอร์ · ไม่ฝังใน RSC payload |
| PDF | `/api/lesson-media/[lessonId]` stream + Range | pdf.js ติด CORS ข้ามโดเมน · object key ไม่หลุด · ตรวจสิทธิ์ทุก request |
| ไฟล์ประกอบ | `/api/lesson-file/[attachmentId]` → redirect ไป signed URL | เฉพาะไฟล์ที่ผู้สอนติ๊กให้ดาวน์โหลด (FR-05.7) |

**เนื้อหาบทเรียนต้องอยู่ใน `<ProtectedViewer>`** — ลายน้ำ, ปิดคลิกขวา/คัดลอก, เบลอเมื่อเสียโฟกัส และ `@media print`
ผูกกับ attribute `data-protected` · เปิดใช้เมื่อเปิดทั้งสวิตช์ระดับระบบและระดับคอร์ส (FR-15.9)

**UI/A11y** — mobile-first ทดสอบที่ 375 / 768 / 1280px · ทุกหน้ามี loading / empty / error state
touch target ≥ 44px · keyboard navigation และ contrast ตาม WCAG AA

**Definition of Done ต่อโมดูล (spec §3.0)** — DB · Server (queries/actions + สิทธิ์ใน DAL) · Zod schema ไทย · UI responsive ครบ state · A11y · Test (unit + e2e) · Audit log + อัปเดตเอกสาร

## 6. ข้อควรระวังที่เคยเสียเวลามาแล้ว

- **ฟอร์มรีเซ็ตเอง** → ใช้ `submitForm()` ไม่ใช่ `action={}` (ดู §5)
- **`server-only` หลุดเข้า browser bundle** → build ล้มทั้งระบบ · เช็คว่าไฟล์ที่ client import ไม่ลากเอา `db`/`next/headers` ไปด้วย
- **Playwright ติด rate limit ของตัวเอง** → โควตา login 5 ครั้ง/15 นาที (FR-01.7) ใช้ร่วมกันทั้งชุดเทสต์
  ระหว่างพัฒนาใช้ `pnpm test:e2e --no-deps` เพื่อใช้ session ที่เก็บไว้ใน `tests/e2e/.auth`
- **MinIO ต้องใช้ path-style** (`S3_FORCE_PATH_STYLE=true`) ส่วน R2 ไม่ต้อง — ต่างกันแค่ env
- **pdf.js worker กับ Turbopack** ต้องทดสอบบน `next build` ไม่ใช่แค่ `next dev`
- **ไฟล์ที่ถูกแทนที่** (เปลี่ยนปก/เปลี่ยนวิดีโอ) ยังค้างใน storage — ยังไม่มีงานเก็บกวาด อย่าลืมเมื่อถึงคิว
- **`/api/media/[assetId]` รับเฉพาะรูปภาพ** — วิดีโอ/PDF ของบทเรียนไปตามตารางใน §5 ไม่ใช่เส้นทางนี้
- **pdf.js v6 วาง `destroy()` ไว้ที่ loading task ไม่ใช่ที่ `PDFDocumentProxy`** เรียกผิดตัวแล้ว throw ตอน unmount
  จน client navigation พังทั้งหน้า (`PDFDocumentProxy` มีแต่ `cleanup()`)
- **ห้ามให้ React remount node ที่ถูกลบออกจาก DOM ไปแล้วจากภายนอก** — React จะเรียก `removeChild`
  กับ node ที่ไม่มีพ่อแม่แล้ว throw จนทั้ง subtree หลุด · ลายน้ำจึงใช้วิธี **appendChild ของเดิมกลับเข้าไป**
- **โมดูลที่มี `server-only` import ใน vitest ไม่ได้** — jsdom ถูกนับเป็น client · `vitest.config.ts`
  alias ไปที่ `tests/unit/stubs/server-only.ts` ให้แล้ว
- **`<RichText>` คืน `null` เมื่อไม่มีเนื้อหา แต่ `<RichText/>` เป็น element ที่ยัง truthy เสมอ**
  จะเช็คว่าบทเรียนมีเนื้อหาไหม ให้ถาม `parseRichTextDoc(content)` ไม่ใช่เช็คค่า JSX
- **เพิ่ม route ใหม่แล้ว `pnpm typecheck` แดงเรื่อง `AppRoutes`** → รัน `npx next typegen` ก่อน (หรือ `pnpm dev`/`pnpm build` สักครั้ง)
- **Playwright `--workers` เริ่มต้น (5) หนักเกินเครื่องพัฒนา** — `page.goto` timeout แบบสุ่มในเทสต์ที่ไม่เกี่ยวกับงานที่แก้
  รันชุดเต็มด้วย `pnpm test:e2e --workers=2`
- **desktop กับ mobile ใช้บัญชีเดียวกันและรันพร้อมกัน** — เทสต์ที่เขียนข้อมูลต้องแยกคอร์ส/ข้อมูลตาม `testInfo.project.name`
  ไม่งั้นสองโปรเจกต์จะแย่งสถานะของกันเอง (ดู `tests/e2e/enrollment.spec.ts`)
- **`<Progress>` ของ shadcn ไม่ส่ง `value` ต่อให้ Radix** → ไม่มี `aria-valuenow` · เทสต์ให้อ่านจาก `aria-label` ที่ใส่เปอร์เซ็นต์ไว้
- **checkbox ใน Zod v4** — `z.union([...]).nullish().transform(...)` ไม่ใช่ใส่ `z.undefined()` ใน union
  (ไม่งั้น key ที่ไม่ถูกส่งมาจะไม่ผ่าน) และห้ามใช้ `z.coerce.boolean()` กับค่า `"false"` เพราะได้ `true`
- **ไฟล์ `"use server"` export ได้เฉพาะ async function** — ค่าคงที่/ตัวแปรที่ export จากไฟล์ actions ทำให้ build ล้ม ให้วางไว้ใน `schemas.ts`
- **`RichTextField` โหลด Tiptap แบบ lazy** — ตัว placeholder ต้องส่งค่าเดิมไปกับฟอร์มด้วย (แก้แล้วใน Phase 2 ขั้น 1)
  ไม่งั้นกดบันทึกก่อน editor โหลดเสร็จจะล้างเนื้อหาทิ้ง
- **ค้นข้อความใน Tiptap JSON** — `string_contains` ของ Prisma ใช้ได้เฉพาะเมื่อค่า JSON เป็นสตริง ใช้ `$queryRaw` กับ `col::text ILIKE` (ส่งพารามิเตอร์) แทน
- **`loading.tsx` ทำให้ `forbidden()`/`notFound()` ที่เรียกในหน้าตอบสถานะ 200** (stream ออกไปก่อนแล้ว — UI 403 ยังแสดงถูก)
  หน้าที่ต้องการสถานะจริง (เช่น `/quiz/[attemptId]`) จึงไม่มี loading · การตรวจใน layout ไม่โดนผลนี้
- **React Compiler ห้ามเรียก `Date.now()` / อ่าน ref ระหว่าง render** — เอาไปไว้ใน effect หรือเริ่มจากค่าที่ server ส่งมา
- **หน้าที่มีตารางกว้าง (`min-w-[…]` ใน `overflow-x-auto`) ทำให้ Chrome โหมดจำลองมือถือย่อทั้งหน้า**
  (layout viewport กลายเป็น ~688px ทั้งที่ตั้ง 375px) แล้วพิกัดคลิกของ Playwright กับ element ที่ `position: fixed`
  เช่นกล่องโต้ตอบจะไม่ตรงจนคลิกไปโดน overlay — ในเทสต์ให้ส่งฟอร์มด้วยปุ่ม Enter แทนการคลิก
