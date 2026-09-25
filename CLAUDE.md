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
| สถานะปัจจุบัน | **Phase 3 ปิดครบ 2026-09-25** (M11 อีเมล, M12–M14, M16, M17) บน branch `phase-3` · ถัดไป Phase 4 (M18 Payment ฯลฯ) — ต้องวางแผน `phase-4-plan.md` ให้เจ้าของระบบอนุมัติก่อน |
| ภาษา UI | **ภาษาไทยทั้งหมด** รวมข้อความ error และ validation · วันที่แสดงเป็น พ.ศ. (เก็บ UTC แสดง Asia/Bangkok) |
| จุดขายที่ห้ามพลาด | การป้องกันการ capture เนื้อหา (M15) — watermark, signed URL อายุสั้น, ไม่มีปุ่มดาวน์โหลดวิดีโอ/PDF |

## 2. เอกสารที่เป็นแหล่งความจริง

| ไฟล์ | ใช้ตอบคำถามว่า |
|---|---|
| [`docs/spec.md`](./docs/spec.md) | ต้องทำอะไร (FR/NFR, checklist รายโมดูล, สถานะงาน §3.0.1, roadmap) |
| [`docs/system-design.md`](./docs/system-design.md) | ทำอย่างไร (สถาปัตยกรรม, data model, authorization, flow, โครงสร้างโฟลเดอร์ §11) |
| [`docs/phase-3-plan.md`](./docs/phase-3-plan.md) | ลำดับงานของเฟสปัจจุบัน (Phase 3 — อนุมัติแล้ว 2026-09-24) + จุดหยุดตรวจ · แผนเฟสก่อนหน้าอยู่ `phase-1-plan.md` / `phase-2-plan.md` |
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

pnpm cron reminders # เรียก /api/cron/{reminders|live|cleanup} ของเซิร์ฟเวอร์ที่เปิดอยู่ (ต้องตั้ง CRON_SECRET)

pnpm db:migrate     # prisma migrate dev
pnpm db:generate    # prisma generate → src/generated/prisma
pnpm db:seed        # prisma/seed.ts  (ใช้ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
pnpm db:reset       # ล้าง DB + migrate + seed
pnpm db:studio
```

**ก่อนคอมมิตทุกครั้ง:** `pnpm lint && pnpm typecheck && pnpm test` (CI รันชุดเดียวกันใน `.github/workflows/ci.yml`)
— **บังคับด้วย pre-commit hook** ใน `.githooks/pre-commit` (ติดตั้งเองตอน `pnpm install` ผ่านสคริปต์ `prepare`
→ `git config core.hooksPath .githooks`) · ไม่ผ่าน = commit ไม่เกิด · ห้ามข้ามด้วย `--no-verify`
· e2e ไม่อยู่ใน hook — **ก่อน commit ปิดขั้นงานให้รัน `pnpm test:e2e --workers=2` ทั้งชุดเอง**
บริการท้องถิ่น (พอร์ตฝั่งเครื่องตาม `docker-compose.yml`): Postgres `5436` · MinIO `9000` (คอนโซล `9001`) · Mailpit SMTP `1026` / เว็บ+API `8026` (อ่านอีเมลยืนยัน/รีเซ็ตรหัสผ่าน/แจ้งเตือน)
— พอร์ต `8025` บนเครื่องนี้เป็นของ container อื่น ไม่ใช่ของโปรเจกต์

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
  app/api/line/webhook                               LINE (M12) — ตัวตนพิสูจน์ด้วย X-Line-Signature เท่านั้น ไม่มี session
  app/api/submission-file                            เสิร์ฟไฟล์งานที่ผู้เรียนส่ง (เจ้าของ/ผู้สอนของคอร์ส)
  app/api/cron/[job]                                 reminders · live · cleanup — ตัวตนพิสูจน์ด้วย Bearer CRON_SECRET · ไม่มี session
  app/api/certificate/[code] · (public)/verify/[code] ดาวน์โหลดใบประกาศ · หน้าตรวจสอบสาธารณะ (M10)
  app/(learn)/{announcements,notifications}           ผู้รับอ่านประกาศ · หน้ารวมการแจ้งเตือน (M11)
  app/(learn)/learn/[courseId]/qa[/threadId]          ถาม-ตอบ (M13) · กล่องคำถามผู้สอน `/teach/courses/[id]/qa`
  app/(learn)/settings/privacy · api/privacy/export   PDPA ของผู้ใช้ (M17) · ผู้ดูแล `/admin/{audit,settings,deletion-requests}`
  components/protected-viewer/                       M15 — กล่องครอบเนื้อหา + ลายน้ำ + ตัวดักเหตุการณ์
  features/<feature>/  queries.ts · actions.ts · schemas.ts · components/ · lib/
  components/  ui (shadcn) · shared · layout · editor · brand
  lib/         โครงพื้นฐานที่ใช้ร่วมกันทุกฟีเจอร์
  generated/prisma/                                   ผลจาก prisma generate (ห้ามแก้มือ)
prisma/ schema.prisma · migrations · seed.ts
tests/  unit (Vitest) · e2e (Playwright)
assets/fonts/anuphan/  TTF สำหรับ PDF ใบประกาศ (OFL)
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
| `audit.ts` | `writeAudit()` — บันทึก AuditLog · ซ่อนค่าฟิลด์ password/token/secret ให้เอง (`redactSecrets()` ใน `features/audit/lib/json.ts`) |
| `notify/index.ts` | `notify()` — **จุดเดียวที่สร้างการแจ้งเตือน** · ในแอปเขียนทันที · ช่องทางภายนอกส่งหลัง response ด้วย `after()` (นอก request รันต่อทันที) · ไม่ throw |
| `notify/prefs.ts` (client ใช้ได้) | `User.notifyPrefs` → `parseNotifyPrefs()` เติมค่าเริ่มต้น (อีเมลเปิด: ENROLLED/GRADED/DUE_SOON/CERTIFICATE) · `pickRecipients()` · `notifyPrefsFromForm()` |
| `notify/channels/line.ts` · `line/{client,signature}.ts` | push LINE ให้ผู้ที่ผูกบัญชีและเปิดไว้ · เรียก Messaging API ด้วย `fetch` (ไม่ throw) · ตรวจลายเซ็น webhook แบบ timing-safe |
| `notify/channels/email.ts` | อีเมลแจ้งเตือน — เฉพาะผู้ที่เปิดไว้ ไม่ถูกระงับ ยืนยันอีเมลแล้ว · **escape ทุกข้อความก่อนเข้า HTML** · ลิงก์ต้องเป็น path ในแอปเท่านั้น |
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

**สมุดคะแนน (M09)** — คะแนนต้นทาง (ส่งข้อสอบ/ตรวจอัตนัย/ส่งงาน/ตรวจงาน) เปลี่ยนเมื่อไรต้องเรียก `afterScoreChange()`
จาก `features/gradebook/lib/sync.ts` · ห้ามเขียน `Grade` ตรง ๆ นอก `sync.ts` และ `gradebook/actions.ts`
· คะแนนรวมคำนวณด้วย `weightedTotal()` ใน `lib/calc.ts` เท่านั้น (เศษส่วนตรงตัว ปัดครั้งเดียว)
· **Score Curve (FR-09.6–09.9)** — ตัดผลด้วย `bandFor()` ใน `lib/curve.ts` (ตัดทศนิยมทิ้งก่อนเทียบ: 79.50 → 79) · ตรวจเกณฑ์ด้วย `checkCurve()` ตัวเดียวทั้งหน้าจอและ server
· **ค่าเกณฑ์อยู่ใน DB เท่านั้น** (`ScoreCurve` ทั้งระบบ/รายคณะ + `Course.gradeScale` ที่ผู้สอนตั้งทับ) — หาด้วย `resolveCourseCurve()` ใน `features/score-curve/queries.ts`
  (คอร์ส → คณะ → คณะแม่ → ทั้งระบบ) · ห้ามใส่ค่าเกณฑ์ในโค้ดฝั่งหน้าเว็บ · โหมดเกรด/S-U อยู่ที่ `Course.gradingMode`

**ใบประกาศ (M10)** — ออกที่ `notifyCourseCompleted()` จุดเดียว (ทุกทางที่ทำให้จบคอร์สต้องเรียกฟังก์ชันนี้)
· **ทุกข้อความที่เข้า PDF ต้องผ่าน `pdfText()`/`pdfWords()`** และมาจาก `buildCertificateModel()` เท่านั้น (บั๊ก `ำ` ของ react-pdf)
· ใบที่ออกแล้วไม่เพิกถอนอัตโนมัติ — เพิกถอนได้โดยผู้ดูแลที่ `/admin/certificates`

**การแจ้งเตือน (M11)** — เรียก `notify()` จาก `@/lib/notify` เท่านั้น ห้าม `db.notification.create*` เอง · ห้ามเรียก `sendMail()` เพื่อแจ้งเตือนเอง
(ช่องทางตามการตั้งค่า FR-11.4 ที่ `/settings/notifications` จัดการใน `notify()` แล้ว) · ชนิดใหม่ต้องเพิ่มใน `NOTIFY_TYPE_LABEL` ของ `prefs.ts`
ตัวเลขบนกระดิ่งมาจาก `getUnreadNotificationCount()` ที่ layout `(learn)`/`(instructor)` ส่งให้ `TopBar`/`BottomNav`
แจ้งเตือนที่ต้องไม่ซ้ำ (cron) ส่ง `dedupeKey` ให้ `notify()` — DB กันซ้ำด้วย unique `[userId, dedupeKey]` และช่องทางภายนอกส่งเฉพาะแถวใหม่ · key ผูกเวลาของเหตุการณ์ (`features/cron/lib/rules.ts`)
ประกาศตรวจสิทธิ์ตามระดับ: `COURSE` → `assertCourseAccess(…, "teach")` · `GLOBAL`/`DEPARTMENT` → `canPostOrgAnnouncement()`
และการแก้/ลบ/ปักหมุดตรวจกับระดับที่บันทึกใน DB ไม่ใช่ค่าจากฟอร์ม

**ถาม-ตอบ (M13)** — ตรวจสิทธิ์ด้วย `assertQaAccess()` (`features/qa/lib/access.ts`) ไม่ใช่ `assertCourseAccess(…, "learn")` เพราะผู้เรียนหมดอายุยังอ่านได้
· เนื้อหาเป็น**ข้อความล้วน** แสดงผ่าน `<PlainText>` (text node + `linkify()` เฉพาะ http/https) ห้าม `dangerouslySetInnerHTML` · อยู่นอก `<ProtectedViewer>`
· ป้าย "แก้ไขแล้ว" มาจาก `editedAt` (ตั้งเฉพาะ action แก้เนื้อหา) · ลบโดยผู้ดูแล = ลบจริง + สำเนาใน AuditLog

**รีวิว (M14)** — แก้/ซ่อนรีวิวเมื่อไรต้องเรียก `recomputeCourseRating(tx, courseId)` ใน transaction เดียวกัน (`features/reviews/lib/aggregate.ts`)
· catalog และหน้าคอร์สอ่าน `Course.ratingAvg/ratingCount` ที่เก็บไว้เท่านั้น ห้าม aggregate รีวิวต่อการ์ด · ชื่อผู้รีวิวแสดงผ่าน `publicReviewerName()` เสมอ

**รายงาน (M16)** — ตัวเลขนับใน DB เท่านั้น (`count`/`groupBy`/`$queryRaw`) ไม่ดึงแถวมานับใน JS · สูตรอยู่ใน `features/reports/lib/report.ts`
· ขอบเขตคณะของ DEPT_ADMIN บังคับใน query (`deptScope()`) ไม่ใช่แค่ซ่อนตัวเลือก · ไฟล์ส่งออกผ่าน `spreadsheetSafe()` ทุกช่องที่เป็นข้อความของผู้ใช้
· Recharts ใช้เฉพาะ `/admin` ผ่าน `next/dynamic` — อย่า import ตรงในหน้าอื่น

**Audit · ตั้งค่า · PDPA (M17)** — action ใหม่ที่เขียนข้อมูลสำคัญต้อง `writeAudit()` พร้อม `before`/`after` · อย่าใส่ค่าลับใน audit (ถูกซ่อนให้แต่ไม่ควรพึ่ง)
· ชื่อระบบ/โลโก้อ่านด้วย `getBranding()` (server) หรือ `useBranding()` (client) — ห้ามเขียน "KRIRK LMS" ตายตัวในหัวเว็บใหม่
· ตารางใหม่ที่เก็บข้อมูลส่วนบุคคลต้องเพิ่มใน `anonymizeUser()` และ `buildPersonalDataExport()` ของ `features/privacy/lib/` เสมอ
· บัญชีที่ลบแล้วมี `deletedAt` — query ที่นับ/แสดงรายชื่อผู้ใช้ต้องกรอง `deletedAt: null` · สวิตช์การป้องกันระดับระบบอยู่ที่ `/admin/settings`

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
  · setup ล็อกอิน 4 บัญชี (student/instructor/admin/deptAdmin) + เทสต์ล็อกอินจริง 1 = **เต็มโควตาพอดี** เพิ่มบัญชีทดสอบอีกไม่ได้
  · เทสต์ที่เปิดหลายหน้าต่อกันใส่ `test.slow()` — งบ 30 วินาทีตั้งต้นไม่พอเมื่อเครื่องหน่วยความจำตึง
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
- **DB ทดสอบสะสมคอร์สทุกครั้งที่รัน e2e** (instructor คนเดียวเป็นเจ้าของทั้งหมด) — หน้า `/teach` ยาวขึ้นจนเทสต์หาลิงก์ไม่ทัน
  เทสต์ที่เปิดคอร์สฝั่งผู้สอนให้ใช้ `teachSearch(ชื่อคอร์ส)` จาก `tests/e2e/helpers.ts` (กรองด้วย `/teach?q=`)
  · ล้างได้ด้วย `pnpm db:reset` แล้ว `pnpm storage:init` (Prisma ขอคำยืนยันจากผู้ใช้ก่อนเสมอเมื่อ AI เป็นคนสั่ง)
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
- **grid คอลัมน์เดียวบนมือถือขยายตามเนื้อหาที่ `truncate` จนล้นจอ** — ใส่ `grid-cols-1` และ `min-w-0` ให้ลูกเสมอ (เจอที่ `/dashboard`)
- **Playwright โหลด Prisma client ที่ generate ไม่ได้** (ESM + `import.meta` แต่ Playwright โหลดแบบ CommonJS) — e2e ที่ต้องเตรียมข้อมูลใน DB
  ให้เขียนสคริปต์ใน `tests/e2e/support/` แล้วเรียกด้วย `runFixture()` จาก `helpers.ts` (tsx แยก process) · สคริปต์ tsx ห้ามใช้ top-level await (แปลงเป็น CJS)
- **`prisma migrate dev` ใช้ไม่ได้เมื่อ AI สั่ง** (non-interactive) — เขียน `migration.sql` ด้วย `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` แล้ว `prisma migrate deploy`
  · บางครั้ง `migrate deploy` ถูกระบบสิทธิ์ของ AI ปฏิเสธ (แก้ DB ที่ใช้ร่วม) — ให้เจ้าของระบบรันเอง แล้วค่อยรัน e2e
- **ค้นข้อความใน Tiptap JSON** — `string_contains` ของ Prisma ใช้ได้เฉพาะเมื่อค่า JSON เป็นสตริง ใช้ `$queryRaw` กับ `col::text ILIKE` (ส่งพารามิเตอร์) แทน
- **`loading.tsx` ทำให้ `forbidden()`/`notFound()` ที่เรียกในหน้าตอบสถานะ 200** (stream ออกไปก่อนแล้ว — UI 403 ยังแสดงถูก)
  หน้าที่ต้องการสถานะจริง (เช่น `/quiz/[attemptId]`) จึงไม่มี loading · การตรวจใน layout ไม่โดนผลนี้
- **react-pdf กับภาษาไทย** — ตัดบรรทัดได้แค่ที่ช่องว่าง และถ้าให้จุดตัดผ่าน `registerHyphenationCallback` จะเติม "-" ทุกจุด
  ฟอนต์ Anuphan ไม่มี glyph ของ zero-width space · วิธีที่ใช้: คำละ `<Text>` ใน `<View>` flex-wrap (`pdfWords()`)
  · ดูผลจริงด้วย `CERT_PDF_OUT=ไฟล์.pdf npx vitest run tests/unit/certificate.test.ts` แล้วเปิดไฟล์
- **อ่าน `e.currentTarget.value` ก่อนเรียก `setState(updater)` เสมอ** — updater ทำงานทีหลัง ตอนนั้น `currentTarget` เป็น null แล้ว
  หน้าพังทั้งหน้า ("This page couldn't load") ตอนพิมพ์ครั้งแรก
- **ห้าม import ค่าคงที่ (ไม่ใช่ component) จากไฟล์ `"use client"` เข้า Server Component** — ได้ client reference ไม่ใช่ค่าจริง ให้วางไว้ใน `schemas.ts`/`lib/`
- **React Compiler ห้ามเรียก `Date.now()` / อ่าน ref ระหว่าง render** — เอาไปไว้ใน effect หรือเริ่มจากค่าที่ server ส่งมา
- **หน้าที่มีตารางกว้าง (`min-w-[…]` ใน `overflow-x-auto`) ทำให้ Chrome โหมดจำลองมือถือย่อทั้งหน้า**
  (layout viewport กลายเป็น ~688px ทั้งที่ตั้ง 375px) แล้วพิกัดคลิกของ Playwright กับ element ที่ `position: fixed`
  เช่นกล่องโต้ตอบจะไม่ตรงจนคลิกไปโดน overlay — ในเทสต์ให้ส่งฟอร์มด้วยปุ่ม Enter แทนการคลิก
