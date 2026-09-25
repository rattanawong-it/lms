# Phase 3 — Engagement: สื่อสาร รายงาน และธรรมาภิบาล

> **สถานะ: อนุมัติแผน 2026-09-24 (คำตอบ §6)** · จัดทำ 2026-09-24 · ต่อจาก Phase 2 (commit `cfa76a7`) · branch `phase-3` (แตกจาก `main` หลัง fast-forward รวม `phase-2` แล้ว)
> ขอบเขตตาม spec.md §6 — **M11 (อีเมล + ตั้งค่าช่องทาง), M12 LINE, M13 Q&A, M14 Review, M16 Reports & Dashboard, M17 Audit Log & Settings**
> ทุกโมดูลต้องผ่าน DoD 7 ข้อตาม spec.md §3.0 · schema/route/dependency บันทึกใน CHANGELOG #31

---

## 1. จุดตั้งต้น — สิ่งที่มีอยู่แล้วจาก Phase 0–2

| มีแล้ว | ที่ไหน | Phase 3 ใช้อย่างไร |
|---|---|---|
| `notify()` จุดเดียวที่ยิงแจ้งเตือน (in-app, ไม่ throw, INSERT ชุดละ 1,000) | `src/lib/notify/index.ts` | เติม adapter อีเมล/LINE ที่นี่ — ฟีเจอร์ต้นทางไม่ต้องแก้ |
| `NotificationType` ครบ 8 ชนิด รวม `DUE_SOON`, `LIVE_SOON`, `QA_REPLY` | schema | ใช้กับ cron แจ้งล่วงหน้า (ขั้น 3) และ Q&A (ขั้น 4) |
| `User.notifyPrefs Json @default("{}")` | schema | เก็บการตั้งค่าช่องทาง FR-11.4 — ไม่ต้องเพิ่มคอลัมน์ |
| `sendMail()` + เทมเพลตอีเมลภาษาไทย · SMTP (Mailpit) / Resend สลับด้วย env | `src/lib/mail.ts` | adapter อีเมลเรียกตัวนี้ |
| ตาราง `LineLink`, `Thread`, `Post`, `Review`, `AuditLog`, `SystemSetting` | schema (สร้างไว้ตั้งแต่ baseline) | ใช้ได้เกือบทั้งหมด — ปรับ 6 จุดตาม §4 |
| ตาราง `Verification` ของ Better Auth (`identifier`, `value`, `expiresAt`) | schema | เก็บรหัสผูก LINE 6 หลัก (หมดอายุ 10 นาที) โดยไม่ต้องสร้างตารางใหม่ |
| `writeAudit()` เรียกแล้วใน 18 ไฟล์ · เก็บ IP แล้ว | `src/lib/audit.ts` | ขั้น 7 ตรวจความครบของ before/after แล้วทำหน้าค้นหา |
| `SystemSetting` ใช้กับสวิตช์ป้องกันเนื้อหาระดับระบบ | `features/protection` | ขยายเป็นหน้าตั้งค่าระบบ FR-17.3 |
| `rateLimit()` | `src/lib/rate-limit.ts` | กันการโพสต์ Q&A/รีวิวถี่ ๆ และการขอรหัสผูก LINE |
| `Lesson.liveUrl` / `liveStartAt` · `Assignment.dueAt` | schema | เป็นเงื่อนไขของ cron แจ้งล่วงหน้า FR-12.3 |
| แดชบอร์ด 3 หน้ามีโครงแล้ว (`/dashboard` มีงานใกล้ครบกำหนด + ประกาศ · `/admin` มีสถิติผู้ใช้) | `app/(learn)/dashboard`, `app/(admin)/admin` | ขยายให้ครบ FR-16.1–16.3 |
| ส่งออก CSV/XLSX (`lib/csv.ts`, `lib/xlsx.ts`) | Phase 2 | FR-16.4 ส่งออกรายงานความคืบหน้า |
| Route ที่ system-design §4.3 จองไว้ | `/settings/*`, `/admin/{reports,audit,settings}`, `/api/line/webhook`, `/api/cron/{reminders,live}` | ใช้ตามนั้น + route ใหม่ตาม §5 |

---

## 2. ลำดับงาน (ขั้น 0 + 7 ขั้น)

เรียงตามการพึ่งพา: ช่องทางแจ้งเตือนต้องพร้อมก่อน Q&A/รีวิวที่ยิงแจ้งเตือน · Q&A ต้องมีก่อนแดชบอร์ดผู้สอน ("คำถามที่ยังไม่ตอบ")
แต่ละขั้น **จบแล้วเห็นผลได้จริงบนหน้าจอ** และจบด้วย lint + typecheck + test + commit · หยุดให้ตรวจที่จุด ✋

### ขั้น 0 — เก็บงานค้างจาก Phase 2 (ครึ่งวัน) — ✅ เสร็จ 2026-09-24
- แจ้งเตือน "ยินดีด้วย คุณเรียนจบคอร์สแล้ว" ให้ระบุชื่อคอร์ส (`notifyCourseCompleted()`)
- seed บัญชี `dept-admin@krirk.ac.th` (DEPT_ADMIN ของคณะตัวอย่าง) + session ใน `tests/e2e/.auth` → e2e สิทธิ์ Score Curve รายคณะ
  และใช้ต่อกับประกาศระดับคณะ/แดชบอร์ดคณะในเฟสนี้

### ขั้น 1 — M11 ช่องทางแจ้งเตือน: อีเมล + ตั้งค่า (FR-11.3, FR-11.4) — ✅ เสร็จ 2026-09-24
- `notify()` แยกเป็น **dispatcher**: เขียนแถว in-app เหมือนเดิม (เปิดเสมอ ปิดไม่ได้) แล้วส่งช่องทางอื่นตาม `notifyPrefs` ของผู้รับแต่ละคน
  ด้วย `after()` ของ Next.js หลัง response (system-design §7) — ไม่ throw และไม่หน่วงงานหลัก
  ```
  lib/notify/
    index.ts        notify() — API เดิม ไม่เปลี่ยน signature
    prefs.ts        รูปแบบ notifyPrefs + ค่าเริ่มต้นต่อชนิด (pure, client ใช้ได้)
    channels/email.ts  channels/line.ts (ขั้น 2)
  ```
- `notifyPrefs` รูปแบบ `{ "<NotificationType>": { "email": bool, "line": bool } }` · key ที่ไม่มีใช้ค่าเริ่มต้น
  | ชนิด | อีเมลเริ่มต้น | เหตุผล |
  |---|---|---|
  | `ENROLLED` · `GRADED` · `DUE_SOON` · `CERTIFICATE` | เปิด | FR-11.3 ระบุไว้ |
  | `ANNOUNCEMENT` · `LIVE_SOON` · `QA_REPLY` · `SYSTEM` | ปิด | ประกาศทั้งระบบ = อีเมลเป็นหมื่นฉบับ (§7) |
- หน้า `/settings/notifications` — ตารางชนิด × ช่องทาง (สวิตช์) · มือถือแสดงเป็นการ์ดต่อชนิด · ช่อง LINE เป็นสีเทาจนกว่าจะผูกบัญชี
- เทมเพลตอีเมลต่อชนิด (หัวเรื่อง + ปุ่มลิงก์ไปหน้าที่เกี่ยวข้อง + ลิงก์ "ตั้งค่าการแจ้งเตือน") ผ่านเทมเพลตกลางใน `mail.ts`
- ผู้ใช้ที่ถูกระงับ/ยังไม่ยืนยันอีเมล ไม่ได้รับอีเมล
- **Test:** unit ของ `prefs.ts` (ค่าเริ่มต้น, key แปลก, ค่าผิดชนิด) และการเลือกผู้รับต่อช่องทาง · e2e ตั้งค่า → ลงทะเบียน → อีเมลเข้า Mailpit (อ่านผ่าน API `:8026`) · ปิดแล้วไม่เข้า

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/notify/{prefs,chunk,types}.ts` · `channels/email.ts` | รูปแบบการตั้งค่า + ค่าเริ่มต้น · ช่องทางอีเมล (escape HTML, ลิงก์ต้องเป็น path ในแอป, ส่งทีละ 5 ฉบับ) |
| `src/lib/notify/index.ts` | `notify()` signature เดิม — เพิ่ม `after()` ส่งช่องทางภายนอก · นอก request รันต่อทันที |
| `features/notifications/{lib/channels.ts, queries, actions, components/notify-prefs-form.tsx}` | ช่องทางที่แก้ได้ (LINE ต้องเปิดใช้ + ผูกบัญชี) · หน้า `/settings/notifications` · บันทึก + AuditLog `user.notify_prefs.update` |
| `src/lib/env.ts` | `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` (ไม่บังคับ) + `hasLine` |

- ส่วน "ปิดแล้วไม่เข้า" ทดสอบที่ unit (`pickRecipients`) — บัญชีผู้เรียนใช้ร่วมกันทั้งชุด e2e การปิดอีเมลจริงจะกระทบเทสต์อื่น
  · e2e ตรวจการส่งจริงที่ `phase-2.spec` (ได้ใบประกาศ → อีเมลใน Mailpit) และตรวจหน้าตั้งค่าที่ `notification-settings.spec`
- พบระหว่างทำ: Mailpit ของโปรเจกต์อยู่พอร์ต `8026` (`8025` ในเครื่องนี้เป็น container อื่น) — แก้ `CLAUDE.md` §3 แล้ว

### ขั้น 2 — M12 LINE: ผูกบัญชี + push (FR-12.1, 12.2, 12.4) — ✅ เสร็จ 2026-09-24 (webhook จำลอง)
- หน้า `/settings/line` — ปุ่ม "เชื่อมต่อ LINE" สร้างรหัส 6 หลัก (เก็บใน `Verification` หมดอายุ 10 นาที, rate limit) + QR/ลิงก์เพิ่มเพื่อน OA
- `/api/line/webhook` — ตรวจ `X-Line-Signature` (HMAC-SHA256 ด้วย channel secret, เทียบแบบ timing-safe) ก่อนอ่าน body
  | event | ทำอะไร |
  |---|---|
  | `message` ที่เป็นรหัส 6 หลัก | ใช้รหัส (ครั้งเดียว) → สร้าง `LineLink` → reply "เชื่อมต่อสำเร็จ" · รหัสผิด/หมดอายุ reply ภาษาไทย |
  | `unfollow` | ลบ `LineLink` (FR-12.4) |
  | `follow` | reply วิธีผูกบัญชี |
- adapter `channels/line.ts` ส่ง push ตาม `notifyPrefs.*.line` · ข้อความสั้น + ลิงก์ · ส่งหลายคนพร้อมกันใช้ multicast (ชุดละ ≤ 500)
- ยกเลิกการผูกจากเว็บ (FR-12.4) · `lineUserId` ซ้ำกับผู้ใช้อื่น = ย้ายการผูกมาที่บัญชีใหม่ (unique อยู่แล้ว)
- ทำงานได้โดยไม่มี env LINE — หน้า `/settings/line` แจ้ง "ระบบยังไม่เปิดใช้ LINE" และ adapter ข้ามเงียบ ๆ
- **Test:** unit ตรวจลายเซ็น (ถูก/ผิด/ไม่มี header) + ตัวจัดการ event · e2e ยิง webhook ที่เซ็นด้วย secret ทดสอบ → ผูกสำเร็จ → unfollow → หลุด
  · **สถาบันยังไม่มี LINE Official Account (Q2)** — ขั้นนี้ทำและทดสอบด้วย webhook จำลองเท่านั้น · ทดสอบกับ LINE จริงเมื่อได้ channel (ไม่ขวางการปิดเฟส)

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/line/{signature,client}.ts` | ตรวจ/เซ็นลายเซ็น (HMAC-SHA256, timing-safe) · reply + multicast ด้วย `fetch` ไม่ throw |
| `src/features/line/` | รหัสผูกบัญชี (ใช้ครั้งเดียว · ขอใหม่ = รหัสเดิมตาย) · ผูก/ยกเลิก + AuditLog `line.link`/`line.unlink` · ตัวจัดการ event · หน้า `/settings/line` (QR + ลิงก์เพิ่มเพื่อนเมื่อตั้ง `LINE_OA_BASIC_ID`) |
| `src/app/api/line/webhook/route.ts` | 404 เมื่อไม่ได้เปิด LINE · 401 ลายเซ็นผิด · 200 ทุกครั้งที่ลายเซ็นถูก |
| `src/lib/notify/channels/line.ts` | ช่องทาง LINE ของ `notify()` (ส่งพร้อมอีเมล ล้มแยกกัน) |

- **เพิ่มจากแผน:** จำกัดการลองรหัส 5 ครั้ง/15 นาทีต่อบัญชี LINE — กันผู้โจมตีเดารหัสเพื่อผูก LINE ของตัวเองเข้ากับบัญชีคนอื่น
- env ใหม่ `LINE_OA_BASIC_ID`, `LINE_API_URL` · Playwright โหลด `.env` เพื่อเซ็น webhook ด้วย secret เดียวกับ dev server (CHANGELOG #32)
- e2e `line.spec` ใช้บัญชีผู้สอน (บัญชีผู้เรียนถูก `notification-settings.spec` ตรวจสถานะ LINE อยู่) · ข้ามทั้งไฟล์เมื่อไม่ได้เปิด LINE ใน `.env`

### ขั้น 3 — Cron แจ้งล่วงหน้า + เก็บกวาด (FR-12.3, NFR-05) — ✅ เสร็จ 2026-09-25 · ✋ *จุดตรวจที่ 1*
- `/api/cron/reminders` (ทุกชั่วโมง) — งานที่ `dueAt` อยู่ในอีก ≤ 24 ชม. แจ้งผู้เรียนที่ยังไม่ส่ง (`DUE_SOON`)
- `/api/cron/live` (ทุก 15 นาที) — บทเรียน `LIVE` ที่เริ่มใน ≤ 1 ชม. แจ้งผู้เรียนของคอร์ส (`LIVE_SOON`)
- **ไม่ส่งซ้ำ:** `Notification.dedupeKey` (§4 S1) เช่น `due:<assignmentId>` · `live:<lessonId>:<liveStartAt>` (เลื่อนเวลาแล้วแจ้งใหม่ได้)
- `/api/cron/cleanup` (วันละครั้ง) — ลบ `ScreenEventLog`/`AuditLog` ที่เก่ากว่า 1 ปี (NFR-05) · ลบการแจ้งเตือนที่อ่านแล้วเกิน 180 วัน
- ทุก endpoint: `Authorization: Bearer ${CRON_SECRET}` · คืนจำนวนที่ส่ง · ตอนพัฒนาเรียกด้วย `pnpm cron <ชื่อ>` (สคริปต์ใหม่)
- **Test:** unit ของตัวเลือกผู้รับ (ขอบ 24 ชม., ส่งแล้ว, หมดอายุ, enrollment ไม่ active) · e2e เรียก cron 2 ครั้ง → แจ้งครั้งเดียว · ไม่มี token → 401
- ✋ **จุดตรวจที่ 1:** ตั้งค่า → อีเมลใน Mailpit → ผูก LINE (ถ้ามี channel) → cron แจ้งงานใกล้ครบกำหนด

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `prisma/migrations/20260925020000_notification_dedupe_key` | S1 `Notification.dedupeKey` + unique `[userId, dedupeKey]` |
| `src/lib/notify/index.ts` | `notify({ dedupeKey })` → `createManyAndReturn({ skipDuplicates })` · อีเมล/LINE ส่งเฉพาะแถวที่สร้างใหม่จริง |
| `src/features/cron/lib/rules.ts` | pure: ช่วงเวลา, key กันซ้ำ, `activeLearners()`, `pendingSubmitters()`, อายุการเก็บข้อมูล |
| `src/features/cron/jobs.ts` | `runDueReminders()` · `runLiveReminders()` · `runCleanup()` (+ AuditLog `cron.cleanup` เมื่อมีการลบ) |
| `src/app/api/cron/[job]/route.ts` | route เดียวรับ `reminders` / `live` / `cleanup` · GET (Vercel Cron) และ POST · 404 เมื่อไม่ได้ตั้ง `CRON_SECRET` · 401 token ผิด |
| `scripts/cron.ts` | `pnpm cron <reminders\|live\|cleanup>` เรียก endpoint ของเซิร์ฟเวอร์ที่เปิดอยู่ |

- **ปรับจากแผน (CHANGELOG #33):** key ของงานผูกกำหนดส่งด้วย `due:<assignmentId>:<dueAt>` (ผู้สอนเลื่อนกำหนดแล้วผู้เรียนได้แจ้งใหม่ เหมือน live)
  · "ยังไม่ส่ง" รวมผู้ที่งานล่าสุดถูก**ส่งกลับให้แก้** · ผู้รับ = enrollment `ACTIVE` ที่ยังไม่หมดอายุ ในคอร์ส `PUBLISHED`
- e2e `cron.spec` เตรียมข้อมูลตรงใน DB ผ่าน `tests/e2e/support/cron-fixture.ts` (รันด้วย tsx แยก process — Prisma client ที่ generate ใช้ `import.meta` ซึ่ง Playwright โหลดแบบ CommonJS ไม่ได้)
  · ผู้รับอีเมลเป็นบัญชีชั่วคราวค่าเริ่มต้น · ข้ามทั้งไฟล์เมื่อไม่ได้ตั้ง `CRON_SECRET`

### ขั้น 4 — M13 Q&A Discussion (FR-13.1–13.4) — ✅ เสร็จ 2026-09-25
- กระทู้ระดับคอร์สหรือรายบทเรียน · ผู้ตั้ง/ตอบได้ = ผู้มีสิทธิ์ `learn` หรือ `teach` ของคอร์ส (ผู้เรียนหมดอายุอ่านได้แต่โพสต์ไม่ได้)
- ตอบซ้อนได้ 1 ชั้น (ตอบคำตอบ → ผูกกับคำตอบระดับบนสุดเสมอ) · ผู้สอนเลือก "คำตอบที่ดีที่สุด" (1 อันต่อกระทู้) และปิดว่า "แก้ไขแล้ว" · ผู้ตั้งปิดของตัวเองได้
- ผู้สอน/แอดมิน: ปักหมุด · ซ่อน · ลบ (ลบ = ซ่อนถาวร + audit — เก็บหลักฐานไว้) · ผู้เขียนแก้/ลบของตัวเองได้ภายใน 15 นาทีหรือจนกว่าจะมีคนตอบ
- เนื้อหาเป็น**ข้อความล้วน** (ขึ้นบรรทัดได้, ลิงก์ทำให้คลิกได้) ไม่ใช้ Tiptap — ลดพื้นผิว XSS และโหลดเร็วบนมือถือ (Q5)
- แจ้งเตือน (FR-13.4): คำถามใหม่ → ผู้สอนทุกคนของคอร์ส · คำตอบใหม่ → ผู้ตั้งกระทู้ + เจ้าของคำตอบที่ถูกตอบกลับ (ชนิด `QA_REPLY`)
- หน้า: `/learn/[courseId]/qa` (รายการ + กรอง ยังไม่ตอบ/แก้ไขแล้ว/บทเรียน) · `/learn/[courseId]/qa/[threadId]`
  · แท็บ "ถาม-ตอบ" ในหน้าเรียนแสดงกระทู้ของบทเรียนนั้น · `/teach/courses/[id]/qa` กล่องคำถามของผู้สอน
- Q&A ไม่อยู่ใน `<ProtectedViewer>` (เป็นเนื้อหาของผู้ใช้ ไม่ใช่เนื้อหาบทเรียน) — แท็บในหน้าเรียนวางนอกกล่องลายน้ำ
- **Test:** unit สิทธิ์ (ผู้เรียนคอร์สอื่น, หมดอายุ, ซ่อนแล้วคนอื่นไม่เห็น) · e2e ผู้เรียนถาม → ผู้สอนได้แจ้งเตือน → ตอบ + เลือกคำตอบ → ผู้เรียนเห็น

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `prisma/migrations/20260925060000_qa_threads` | S2: `Post.parent` self-relation (Cascade) + index · `Thread.lastPostAt` + index · `editedAt` ของทั้งสองตาราง |
| `src/features/qa/lib/rules.ts` | pure: `qaPermissions()` (หมดอายุ = อ่านอย่างเดียว) · `canSee()` · `canEditOwn()` (15 นาที + ยังไม่มีคนตอบ) · `replyParentId()` · `replyRecipients()` · `linkify()` |
| `src/features/qa/lib/access.ts` | `assertQaAccess(courseId)` — ทุก query/action ของ Q&A เรียกก่อน (404 ไม่มีคอร์ส · 403 ไม่มีสิทธิ์อ่าน) |
| `src/features/qa/{queries,actions,schemas}.ts` | รายการ + ตัวกรอง (ทั้งหมด/ยังไม่มีคำตอบ/แก้ไขแล้ว/บทเรียน) · กระทู้ + คำตอบ · ตั้ง/ตอบ/แก้/ลบ · ปักหมุด/ซ่อน/เลือกคำตอบ/ปิดกระทู้ + AuditLog `qa.*` · rate limit 10 โพสต์/10 นาที |
| หน้า | `/learn/[courseId]/qa` · `/learn/[courseId]/qa/[threadId]` · `/teach/courses/[id]/qa` (เริ่มที่ "ยังไม่มีคำตอบ") · ส่วน "ถาม-ตอบในบทนี้" ท้ายหน้าเรียน (นอก ProtectedViewer) · ลิงก์ในสารบัญและหน้าตั้งค่าคอร์ส |

- **ปรับจากแผน (CHANGELOG #34):** (1) ใช้ `editedAt` แทน `updatedAt` ของ `Thread`/`Post` — `@updatedAt` เปลี่ยนทุกครั้งที่ปักหมุด/ซ่อน/ปิดกระทู้ ทำให้ป้าย "แก้ไขแล้ว" ผิด · `lastPostAt` ไม่เป็น null (เริ่มจากเวลาตั้ง)
  (2) **ผู้ดูแลกด "ลบ" = ลบจริง + เก็บสำเนาข้อความใน AuditLog** (แผนเขียน "ซ่อนถาวร" — การซ่อนมีปุ่มแยกและเลิกซ่อนได้ ถ้าลบเป็นซ่อนจะแยกสองอย่างไม่ออกโดยไม่เพิ่มคอลัมน์)
  (3) เลือกคำตอบที่ดีที่สุดแล้วปิดกระทู้ว่าแก้ไขแล้วด้วย · (4) เจ้าของยังเห็นกระทู้ของตัวเองที่ถูกซ่อน (มีป้าย) แต่ตอบเพิ่มไม่ได้
- e2e `qa.spec` เตรียมคอร์สตรงใน DB ด้วย `support/qa-fixture.ts` ผ่าน `runFixture()` (ย้ายมาไว้ใน `helpers.ts` ใช้ร่วมกับ `cron.spec`)

### ขั้น 5 — M14 Review & Rating (FR-14.1–14.3) — ✅ เสร็จ 2026-09-25
- ผู้เรียนที่ `progressPct ≥ 30` ให้ 1–5 ดาว + ความคิดเห็น (ไม่บังคับ) 1 ครั้งต่อคอร์ส แก้ได้ · ตรวจเงื่อนไขซ้ำฝั่ง server
- คะแนนเฉลี่ย + การกระจาย 5→1 ดาวในหน้าคอร์ส · catalog แสดงค่าเฉลี่ยและจำนวน (ใช้ค่าที่เก็บไว้ §4 S4 — ไม่ aggregate ทุกการ์ด)
- แสดงชื่อผู้รีวิวแบบย่อ ("สมชาย ใ.") (Q6) · รีวิวที่ถูกซ่อนไม่นับในค่าเฉลี่ย
- ผู้สอนตอบกลับได้ 1 ข้อความต่อรีวิว · แอดมินซ่อน/เลิกซ่อนที่ `/admin/reviews` (+ ปุ่มในหน้าคอร์ส) · แจ้งผู้สอนเมื่อมีรีวิวใหม่ (in-app)
- **Test:** unit คำนวณค่าเฉลี่ย/การกระจาย + เงื่อนไข 30% · e2e ผู้เรียนรีวิว → ค่าเฉลี่ยใน catalog เปลี่ยน → ผู้สอนตอบ → แอดมินซ่อน → ค่าเฉลี่ยกลับ

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `prisma/migrations/20260925090000_review_rating` | S3 `Review.repliedAt` + index + CHECK `rating BETWEEN 1 AND 5` · S4 `Course.ratingAvg/ratingCount` + คำนวณค่าจากรีวิวเดิม |
| `src/features/reviews/lib/rules.ts` | pure: `reviewEligibility()` (≥ 30%) · `summarizeRatings()` (เฉลี่ย + กระจาย 5→1) · `publicReviewerName()` ("สมชาย ใ.") |
| `src/features/reviews/lib/aggregate.ts` | `recomputeCourseRating()` — ล็อกแถวคอร์ส (`FOR UPDATE`) แล้วนับจากแถวจริง ใน transaction เดียวกับการเขียน/ซ่อน |
| `src/features/reviews/{actions,queries,schemas}.ts` | เขียน/แก้รีวิว (rate limit) · ผู้สอนตอบกลับ (`teach`) · ผู้ดูแลซ่อน (`manage`) · AuditLog `review.*` · แจ้งผู้สอนเมื่อมีรีวิวใหม่ |
| หน้า | ส่วนรีวิวในหน้า `/courses/[slug]` (สรุป + ฟอร์ม + รายการ + ปุ่มตอบ/ซ่อน) · `/admin/reviews` (กรองถูกซ่อน + ค้นหา) + เมนูแอดมิน |
| `src/features/catalog/queries.ts` | ใช้ `Course.ratingAvg/ratingCount` ที่เก็บไว้ · เรียง "คะแนนรีวิว" ด้วย `orderBy` ของ DB (เลิก aggregate ต่อหน้า) |
| `prisma/seed.ts` | รีวิว 2 รายการ (มีคำตอบกลับ) + กระทู้ถาม-ตอบที่มีคำตอบที่ดีที่สุด ใน `assessment-demo` — ผู้เรียนสาธิตไม่มีรหัสผ่าน |

- **ปรับจากแผน (CHANGELOG #35):** แจ้งผู้สอนด้วยชนิด `SYSTEM` (ไม่มีชนิดรีวิวใน enum — ไม่แก้ schema) · ผู้เรียนที่สิทธิ์หมดอายุยังรีวิวได้ (เรียนไปแล้วจริง) · ผู้สอนของคอร์สไม่เห็นฟอร์มรีวิวคอร์สตัวเอง
  · ตอบกลับว่าง = ลบคำตอบกลับ · เจ้าของรีวิวที่ถูกซ่อนเห็นข้อความแจ้ง
- e2e `reviews.spec`: ต่ำกว่า 30% รีวิวไม่ได้ → รีวิว 4 ดาว → catalog 2.0 → 3.0 → ผู้สอนได้แจ้งเตือน + ตอบกลับ → แอดมินซ่อน → 2.0

### ขั้น 6 — M16 Reports & Dashboard (FR-16.1–16.4)
| หน้า | เพิ่มอะไร |
|---|---|
| `/dashboard` (ผู้เรียน · FR-16.1) | คอร์สที่กำลังเรียน + "เรียนต่อ" · งานใกล้ครบกำหนด (มีแล้ว) · Live class ที่จะมาถึง 7 วัน · ใบประกาศล่าสุด |
| `/teach` (ผู้สอน · FR-16.2) | ต่อคอร์ส: ผู้เรียน, % จบ, งาน/ข้อสอบรอตรวจ, คำถามที่ยังไม่ตอบ (ต่อจากคิวรอตรวจของ Phase 2) |
| `/admin` (แอดมิน · FR-16.3) | ผู้ใช้ทั้งหมด/ใหม่ 30 วัน · คอร์ส · การลงทะเบียน · อัตราการเรียนจบ แยกตามคณะ (DEPT_ADMIN เห็นเฉพาะขอบเขตตน) |
| `/admin/reports` (FR-16.4) | รายงานรายคอร์ส/รายผู้เรียน กรองคณะ/คอร์ส/ช่วงวันที่ + ส่งออก CSV/XLSX |
| `/teach/courses/[id]/students` | ส่งออกความคืบหน้าผู้เรียนของคอร์ส CSV/XLSX |
| `/admin/screen-events` | ตัวกรอง (ผู้ใช้/ชนิด/ช่วงวันที่) + แบ่งหน้า — งานที่ยกมาจาก Phase 1 |
- กราฟ: แนวโน้มการลงทะเบียน 12 เดือนด้วย shadcn chart (Recharts ตาม system-design §2) **เฉพาะหน้า `/admin`** และโหลดแบบ lazy (NFR-02) (Q7)
- ตัวเลขทั้งหมดนับด้วย `groupBy`/`count` ใน DB ไม่ดึงแถวมานับใน JS · เพิ่ม index ที่ขาด (§4 S6)
- **Test:** unit ของสูตรอัตราการเรียนจบ/ขอบเขตคณะ · e2e แต่ละบทบาทเห็นตัวเลขของตัวเอง + ส่งออกไฟล์ได้ (ตรวจหัวคอลัมน์)

### ขั้น 7 — M17 Audit Log · ตั้งค่าระบบ · PDPA + ปิดเฟส — ✋ *จุดตรวจที่ 2*
- **FR-17.1** ไล่ทุก action ที่เขียนข้อมูลสำคัญให้บันทึก `before`/`after` ครบ (ตารางตรวจใน PR) · ไม่เก็บรหัสผ่าน/โทเค็นใน `before`/`after`
- **FR-17.2** `/admin/audit` (SUPER_ADMIN) — ค้นตามผู้กระทำ, action, entity/id, ช่วงวันที่ · แบ่งหน้า · ดู diff ก่อน/หลัง
- **FR-17.3** `/admin/settings` (SUPER_ADMIN) — ชื่อระบบ, โลโก้ (อัปโหลดรูป), ค่าเริ่มต้นการป้องกันเนื้อหา (ย้ายจากที่เดิม),
  สถานะอีเมล/LINE + ปุ่ม "ส่งทดสอบ" · **ค่า secret (SMTP, LINE channel) อยู่ใน env ไม่เก็บใน DB** (Q8)
- **FR-17.4 PDPA** ที่ `/settings/privacy`
  - ส่งออกข้อมูลตนเอง: ไฟล์ JSON (โปรไฟล์, การลงทะเบียน, ความคืบหน้า, คะแนน, งานที่ส่ง (รายชื่อไฟล์), ใบประกาศ, กระทู้/รีวิว, การแจ้งเตือน) · rate limit วันละ 3 ครั้ง
  - **ขอลบบัญชี — แอดมินอนุมัติก่อน (Q9)**
    1. ผู้ใช้ยืนยันรหัสผ่านอีกครั้งแล้วส่งคำขอ (ระบุเหตุผลได้) → `User.deletionRequestedAt` (§4 S5) · แจ้ง SUPER_ADMIN (in-app) · ผู้ใช้ยกเลิกคำขอเองได้จนกว่าจะอนุมัติ
    2. SUPER_ADMIN ที่ `/admin/deletion-requests` อนุมัติ หรือปฏิเสธพร้อมเหตุผล (แจ้งผลผู้ใช้ทางอีเมลก่อนลบ) · audit ทั้งสองทาง
    3. อนุมัติ → **anonymize** (system-design §3.3) ชื่อ/อีเมล/เบอร์/รหัสนักศึกษา/รูป, ลบ session/account/LineLink, ตั้ง `User.deletedAt`
    · คะแนน/ประวัติสอบคงอยู่แบบไม่ระบุตัวตนเพื่อสถิติของคอร์ส · ใบประกาศที่ออกแล้วยังตรวจที่ `/verify` ได้ แต่ชื่อแสดงเป็น "ผู้ใช้ที่ลบบัญชีแล้ว"
    · SUPER_ADMIN คนสุดท้ายขอลบบัญชีไม่ได้ · ผู้อนุมัติอนุมัติคำขอของตัวเองไม่ได้
- ปิดเฟส: e2e `tests/e2e/phase-3.spec.ts` (ผู้เรียนถาม → ผู้สอนตอบ → แจ้งเตือนอีเมล → รีวิว → แดชบอร์ดผู้สอนเห็นตัวเลข → แอดมินเห็น audit)
  · อัปเดต spec §3.0.1/§6, system-design, CLAUDE.md
- ✋ **จุดตรวจที่ 2:** ทดสอบบน Chrome ครบ flow + หน้า `/settings/privacy`

---

## 3. สิ่งที่ต้องเพิ่มนอกเหนือจากโค้ดฟีเจอร์

| รายการ | เหตุผล | ขั้น |
|---|---|---|
| env `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (มีใน `.env.example` แล้ว) + เพิ่ม `LINE_OA_BASIC_ID` สำหรับลิงก์เพิ่มเพื่อน · ทั้งหมดไม่บังคับใน `env.ts` | FR-12 | 2 |
| env `CRON_SECRET` (มีใน `.env.example` แล้ว) + สคริปต์ `pnpm cron <ชื่อ>` | เรียก cron ตอนพัฒนาโดยไม่ต้องมี scheduler | 3 |
| ตัวอ่านอีเมลจาก Mailpit API สำหรับ e2e (`tests/e2e/helpers.ts`) | ตรวจว่าอีเมลส่งจริงและไม่ส่งเมื่อปิด | 1 |
| dependency ใหม่: `recharts` (ผ่าน shadcn chart) | กราฟหน้าแอดมิน (Q7) — ไม่เพิ่มถ้าเลือกไม่ใช้กราฟ | 6 |
| LINE — **ไม่เพิ่ม SDK** เรียก Messaging API ด้วย `fetch` (system-design §2) | ลด dependency | 2 |
| seed: บัญชี DEPT_ADMIN + กระทู้/รีวิวตัวอย่างในคอร์ส `assessment-demo` | ทดสอบ/สาธิตได้ทันที | 0, 5 |

---

## 4. การเปลี่ยน Prisma schema — อนุมัติแล้ว (CHANGELOG #31)

| # | เปลี่ยนอะไร | ทำไม |
|---|---|---|
| S1 | `Notification.dedupeKey String?` + `@@unique([userId, dedupeKey])` | cron รันซ้ำ/ทับกันแล้วต้องไม่แจ้งซ้ำ — ให้ DB กันแทนการเช็คก่อนเขียน (race) |
| S2 | `Post.parent` self-relation (`onDelete: Cascade`) + `@@index([threadId, createdAt])` · `Thread.updatedAt`, `Thread.lastPostAt DateTime?` + `@@index([courseId, lastPostAt])` · `Post.updatedAt` | ตอบซ้อน 1 ชั้นต้องมี FK จริง · เรียงกระทู้ตามความเคลื่อนไหวล่าสุด · แสดง "แก้ไขแล้ว" |
| S3 | `Review.repliedAt DateTime?` + `@@index([courseId, isHidden])` + CHECK `rating BETWEEN 1 AND 5` ใน migration | FR-14.3 · schema เขียนว่ามี CHECK แต่ migration ยังไม่มี |
| S4 | `Course.ratingAvg Decimal? @db.Decimal(3,2)` · `Course.ratingCount Int @default(0)` | catalog แสดงค่าเฉลี่ยทุกการ์ดโดยไม่ aggregate ต่อคำขอ · คำนวณใหม่ใน transaction เดียวกับการเขียน/ซ่อนรีวิว |
| S5 | `User.deletionRequestedAt DateTime?` · `User.deletionReason String?` · `User.deletedAt DateTime?` + `@@index([deletionRequestedAt])` | Q9 ลบบัญชีต้องผ่านการอนุมัติ — เก็บสถานะคำขอ · `deletedAt` ระบุบัญชีที่ anonymize แล้ว กันเข้าสู่ระบบ/กันนับในสถิติผู้ใช้ |
| S6 | `AuditLog @@index([createdAt])`, `@@index([action, createdAt])` | หน้าค้นหา audit + ลบข้อมูลเก่า (NFR-05) · ตัวเลขแดชบอร์ดใช้ `Enrollment @@index([courseId, status])` ที่มีอยู่แล้ว |

ไม่ใช้ตารางใหม่ — รหัสผูก LINE อยู่ใน `Verification` · การตั้งค่าอยู่ใน `User.notifyPrefs` / `SystemSetting`

---

## 5. Route ที่เพิ่มจาก route map (system-design §4.3)

| Route | ใช้ทำอะไร |
|---|---|
| `/settings/{notifications,line,privacy}` | ตั้งค่าช่องทาง · ผูก LINE · PDPA (route map มี `/settings/*` อยู่แล้ว — ระบุชื่อหน้า) |
| `/learn/[courseId]/qa` · `/learn/[courseId]/qa/[threadId]` | Q&A ฝั่งผู้เรียน |
| `/teach/courses/[id]/qa` | กล่องคำถามของผู้สอน |
| `/admin/reviews` | ซ่อน/เลิกซ่อนรีวิว |
| `/api/cron/cleanup` | ลบข้อมูลเก่าตาม NFR-05 (route map มี `reminders`, `live`) |
| `/api/privacy/export` | ดาวน์โหลด JSON ข้อมูลตนเอง (Route Handler เพราะเป็นไฟล์) |
| `/admin/deletion-requests` | SUPER_ADMIN อนุมัติ/ปฏิเสธคำขอลบบัญชี (Q9) |

---

## 6. ข้อที่ต้องการคำยืนยันก่อนเริ่ม — ตอบแล้ว 2026-09-24

| # | คำถาม | ข้อเสนอ | คำตอบเจ้าของระบบ |
|---|---|---|---|
| Q1 | ผู้ให้บริการอีเมล (D-02) | พัฒนาบน SMTP/Mailpit ต่อไป — โค้ดรองรับทั้ง SMTP ของสถาบันและ Resend แล้ว ตัดสินตอน deploy ได้ || ตามข้อเสนอ |
| Q2 | สถาบันมี LINE Official Account + Messaging API channel หรือยัง | พัฒนาและทดสอบด้วย webhook จำลองก่อน · ทดสอบกับ LINE จริงเมื่อได้ channel · **แผนฟรีของ OA มีโควตา push ต่อเดือนจำกัด** ควรเลือกแผนก่อนเปิดใช้จริง | **ยังไม่มี LINE Official Account** → ทำด้วย webhook จำลอง ทดสอบของจริงภายหลัง |
| Q3 | แจ้งล่วงหน้าครอบคลุมอะไรบ้าง | งานที่ครบกำหนดใน 24 ชม. (ยังไม่ส่ง) + Live ใน 1 ชม. ตาม FR-12.3 · **ไม่รวม**แบบทดสอบที่ใกล้ปิด (เพิ่มได้ภายหลัง) || ตามข้อเสนอ |
| Q4 | Hosting ของ cron (ยังไม่กำหนด) | ทำเป็น HTTP endpoint + `CRON_SECRET` ใช้ได้ทั้ง Vercel Cron และ crontab ของสถาบัน · ตอนพัฒนาเรียกเอง || ตามข้อเสนอ |
| Q5 | เนื้อหา Q&A เป็นข้อความล้วนหรือ rich text | **ข้อความล้วน** (ขึ้นบรรทัด + ลิงก์คลิกได้) · ถ้าต้องการแนบรูป/โค้ด บอกได้ จะใช้ Tiptap แบบจำกัดปุ่ม || ตามข้อเสนอ |
| Q6 | ชื่อผู้รีวิวที่แสดงต่อสาธารณะ | ชื่อ + อักษรแรกของนามสกุล ("สมชาย ใ.") · คอร์ส PUBLIC ผู้เยี่ยมชมเห็นรีวิวด้วย || ตามข้อเสนอ |
| Q7 | แดชบอร์ดต้องมีกราฟไหม | กราฟเดียวที่ `/admin` (แนวโน้มลงทะเบียน) ด้วย Recharts โหลดแบบ lazy · ที่เหลือเป็นการ์ดตัวเลข/แถบความคืบหน้า || ตามข้อเสนอ |
| Q8 | FR-17.3 "SMTP/LINE channel" ในหน้าตั้งค่า | **ค่า secret อยู่ใน env** — หน้าเว็บแสดงสถานะ + ปุ่มส่งทดสอบ · เก็บ secret ใน DB ต้องเข้ารหัสและเพิ่มความเสี่ยง (ถือเป็นการแก้ requirement → CHANGELOG) | ตามข้อเสนอ |
| Q9 | ลบบัญชีตาม PDPA | ผู้ใช้กดเองได้ทันทีหลังยืนยันรหัสผ่าน → anonymize (ไม่ลบแถว) · **ใบประกาศที่ออกแล้วยังตรวจสอบได้ที่ `/verify` แต่ชื่อแสดงเป็น "ผู้ใช้ที่ลบบัญชีแล้ว"** · หรือต้องให้แอดมินอนุมัติก่อน? | **แอดมินอนุมัติก่อน** → ขั้น 7 + S5 + `/admin/deletion-requests` |
| Q10 | branch และการ merge | merge `phase-2` เข้า `main` แล้วแตก `phase-3` จาก `main` · push เมื่อเจ้าของระบบสั่ง | ตามข้อเสนอ — fast-forward `main` → `cfa76a7` และแตก `phase-3` แล้ว (ยังไม่ push) |
| Q11 | จุดหยุดตรวจ 2 จุด (หลังช่องทางแจ้งเตือน และปิดเฟส) พอไหม | พอ — เหมือน Phase 1–2 || ตามข้อเสนอ |
| Q12 | ยืนยันการเปลี่ยน schema S1–S6 และ route ใน §5 | — || ตามข้อเสนอ |
| — | หน้า `/privacy` (ค้างจาก M03) | ขอเนื้อหานโยบายความเป็นส่วนตัวจากสถาบัน — ขั้น 7 ต้องลิงก์ไปหน้านี้ | รออนุมัติรายละเอียดเนื้อหา — ไม่ขวางขั้น 0–6 |

---

## 7. ความเสี่ยงที่มองเห็นตอนนี้

| ความเสี่ยง | ผลกระทบ | แนวทาง |
|---|---|---|
| ประกาศทั้งระบบส่งอีเมล/LINE เป็นหมื่นฉบับ | โดนผู้ให้บริการจำกัด/ตัดบริการ · เสียเงินค่า push | ประกาศปิดอีเมล/LINE เป็นค่าเริ่มต้น · ส่งเป็นชุด · ถ้าปริมาณโตใช้ job queue (pg-boss) ตาม system-design §7 |
| `after()` ถูกตัดเมื่อ process ตาย | อีเมลบางฉบับหาย | ยอมรับในเฟสนี้ (in-app ยังอยู่เสมอ) · log ความล้มเหลว · queue เมื่อจำเป็น |
| webhook ปลอม | ผูกบัญชี LINE ของคนอื่น | ตรวจลายเซ็นก่อนทำอะไร · รหัสใช้ครั้งเดียว 10 นาที · rate limit การขอรหัส |
| cron รันซ้อน | แจ้งซ้ำ | unique `dedupeKey` (S1) · `createMany({ skipDuplicates })` |
| Q&A/รีวิวถูกใช้ส่งสแปม/เนื้อหาไม่เหมาะสม | ภาพลักษณ์ | ข้อความล้วน + escape · rate limit ต่อผู้ใช้ · ซ่อน/ลบโดยผู้สอน-แอดมิน + audit |
| ค่าเฉลี่ยรีวิวที่เก็บไว้เพี้ยนจากข้อมูลจริง | catalog แสดงผิด | คำนวณใหม่จากแถวจริงใน transaction เดียวกันทุกครั้ง (ไม่บวกลบสะสม) |
| ตัวเลขแดชบอร์ดช้าเมื่อข้อมูลโต | LCP เกิน 2.5s | aggregate ใน DB + index (S6) · Suspense แยกการ์ด |
| anonymize แล้วข้อมูลหลุดทางอื่น | ผิด PDPA | ไล่ทุกตารางที่มีข้อมูลส่วนบุคคล (รวม `AuditLog.before/after`, ไฟล์ที่ส่ง) ในขั้น 7 และมี unit test รายการฟิลด์ |
| ข้อมูลส่งออกรั่วข้ามผู้ใช้ | ผิด PDPA ร้ายแรง | export อ่านจาก session เท่านั้น ไม่รับ id จาก client · e2e ตรวจว่าไม่มีข้อมูลของผู้อื่น |
