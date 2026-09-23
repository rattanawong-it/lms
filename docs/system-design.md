# LMS — System Design

| รายการ | ค่า |
|---|---|
| เวอร์ชัน | 1.0 (Draft for review) |
| วันที่ | 2026-09-19 |
| อ้างอิง | [`spec.md`](./spec.md) (FR/NFR) |

> การเปลี่ยนแปลงเอกสารนี้ต้องแจ้งเจ้าของระบบก่อนทุกครั้ง และบันทึกไว้ใน [`CHANGELOG-REQUIREMENTS.md`](./CHANGELOG-REQUIREMENTS.md)

---

## 1. Architecture Overview

### 1.1 System Context (C4 Level 1)
```mermaid
flowchart LR
  guest([ผู้เยี่ยมชม])
  student([ผู้เรียน])
  instructor([ผู้สอน])
  admin([Super / Dept Admin])

  lms[[LMS Web App<br/>Next.js 16]]

  google[(Google OAuth)]
  mail[(Email Provider<br/>Resend / SMTP)]
  line[(LINE Messaging API)]
  meet[(Zoom / Google Meet)]
  yt[(YouTube / Vimeo)]

  guest --> lms
  student --> lms
  instructor --> lms
  admin --> lms
  lms --> google
  lms --> mail
  lms <--> line
  student -. เปิดลิงก์ .-> meet
  lms -. embed .-> yt
```

### 1.2 Container Diagram (C4 Level 2)
```mermaid
flowchart TB
  subgraph Client["Browser (มือถือ / คอมพิวเตอร์)"]
    ui[React UI<br/>Server + Client Components<br/>shadcn/ui + Tailwind v4]
    pv[ProtectedViewer<br/>watermark / anti-capture]
  end

  subgraph App["Next.js 16 App (Node runtime, stateless)"]
    proxy[proxy.ts<br/>optimistic auth + route guard]
    rsc[App Router pages<br/>Server Components]
    sa[Server Actions<br/>mutations]
    rh[Route Handlers<br/>/api/auth, /api/upload,<br/>/api/media, /api/line/webhook,<br/>/api/cron/*]
    dal[Data Access Layer<br/>features/*/queries & actions<br/>+ RBAC checks]
    svc[Services<br/>storage / notify / pdf / audit]
  end

  db[(PostgreSQL<br/>via Prisma)]
  s3[(Object Storage<br/>S3-compatible: R2 / MinIO / S3)]
  cron{{Scheduler<br/>Vercel Cron / crontab}}

  ui --> proxy --> rsc
  ui --> sa
  ui --> rh
  rsc --> dal
  sa --> dal
  rh --> dal
  dal --> db
  dal --> svc
  svc --> s3
  ui -- presigned PUT/GET --> s3
  cron --> rh
```

### 1.3 หลักการออกแบบ
1. **Server-first:** ใช้ React Server Components เป็นค่าเริ่มต้น และใช้ `"use client"` เฉพาะส่วนที่ต้องโต้ตอบ (player, editor, form, ProtectedViewer)
2. **Mutation ผ่าน Server Actions:** ได้ CSRF protection มาในตัว ส่วน Route Handler ใช้เฉพาะงานที่ต้องเป็น HTTP endpoint (auth, webhook, cron, media stream)
3. **Defense in depth สำหรับสิทธิ์:** `proxy.ts` กรองแบบเร็ว (มี session cookie หรือไม่) และ**ตรวจสิทธิ์จริงใน DAL** ทุก query/action
4. **Feature-sliced:** โค้ดแต่ละโมดูล (M01–M18) อยู่ใน `src/features/<module>` ของตัวเอง
5. **Stateless + Portable:** ไม่มี state ใน memory ของแอป ไฟล์ทั้งหมดอยู่ใน object storage และตั้งค่าทุกอย่างผ่าน env

### 1.4 Layering
```
src/app/**            → Routing, layout, page (ประกอบ UI + เรียก queries)
src/features/<mod>/   → queries.ts, actions.ts, schemas.ts (Zod), components/, lib/
src/lib/              → auth, db (Prisma client), rbac, storage, notify, audit, utils
src/components/       → ui/ (shadcn), layout/, shared/
prisma/               → schema.prisma, migrations, seed.ts
```
กฎ dependency: `app → features → lib → db` (ห้ามอ้างย้อนทิศ และ feature ห้าม import ภายในของ feature อื่นโดยตรง ให้ใช้ผ่าน `queries.ts` ที่ export ออกมา)

---

## 2. Tech Stack รายละเอียด

| ด้าน | เลือกใช้ | หมายเหตุ |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict | Turbopack (dev/build), `proxy.ts` |
| Auth | Better Auth + `prismaAdapter` | Google social provider, emailAndPassword, plugin `admin` (role/ban) |
| ORM | Prisma (generator `prisma-client`, `prisma.config.ts`) | client ถูก generate ไปที่ `src/generated/prisma` |
| DB | PostgreSQL 16+ | |
| UI | Tailwind CSS v4 (`@import "tailwindcss"`, `@theme`), shadcn/ui, lucide-react | ฟอนต์ Anuphan + Inter + JetBrains Mono ผ่าน `next/font/google` |
| Forms | react-hook-form + Zod + `@hookform/resolvers` | ใช้ schema เดียวกันทั้ง client และ server |
| Rich text | Tiptap (เก็บเป็น JSON) | render ฝั่ง server เป็น HTML ที่ sanitize แล้ว |
| Table | TanStack Table (ผ่าน shadcn data-table) | ใช้ใน gradebook และรายการผู้ใช้ |
| Drag & drop | dnd-kit | ใช้ใน Course builder |
| Video | `<video>` HTML5 + hls.js (ถ้ามีการทำ HLS) | YouTube/Vimeo ใช้ iframe |
| PDF viewer | pdfjs-dist (render เป็น canvas) | ไม่เปิด text layer / ไม่มีปุ่มดาวน์โหลด |
| PDF generation | @react-pdf/renderer + qrcode | ใช้ออกใบประกาศ |
| Storage | @aws-sdk/client-s3 + s3-request-presigner | ใช้ได้ทั้ง R2, MinIO และ S3 |
| Email | Resend หรือ Nodemailer (SMTP) + React Email | เลือกผ่าน env |
| LINE | LINE Messaging API (fetch) | push + webhook |
| Charts | Recharts (ผ่าน shadcn chart) | ใช้ใน Dashboard |
| Testing | Vitest, Testing Library, Playwright | |
| Quality | ESLint, Prettier, Husky + lint-staged | |

---

## 3. Data Model

### 3.1 ER Diagram (ภาพรวม)
```mermaid
erDiagram
  Department ||--o{ Department : parent
  Department ||--o{ User : has
  Department ||--o{ Course : owns
  Category ||--o{ Course : groups
  User ||--o{ Session : has
  User ||--o{ Account : has
  User ||--o{ CourseInstructor : teaches
  Course ||--o{ CourseInstructor : has
  Course ||--o{ Section : has
  Section ||--o{ Lesson : has
  Lesson }o--o| Asset : uses
  Course ||--o{ Enrollment : has
  User ||--o{ Enrollment : enrolls
  Enrollment ||--o{ LessonProgress : tracks
  Lesson ||--o{ LessonProgress : tracked
  Course ||--o{ Question : bank
  Question ||--o{ Choice : has
  Quiz ||--o{ QuizQuestion : includes
  Question ||--o{ QuizQuestion : in
  Lesson ||--o| Quiz : is
  Quiz ||--o{ QuizAttempt : has
  QuizAttempt ||--o{ Answer : has
  Lesson ||--o| Assignment : is
  Assignment ||--o{ Submission : has
  Submission ||--o{ SubmissionFile : has
  Course ||--o{ GradeItem : has
  GradeItem ||--o{ Grade : has
  User ||--o{ Certificate : earns
  Course ||--o{ Certificate : issues
  Course ||--o{ Announcement : has
  Course ||--o{ Thread : has
  Thread ||--o{ Post : has
  Course ||--o{ Review : has
  User ||--o{ Notification : receives
  User ||--o| LineLink : links
  User ||--o{ ScreenEventLog : triggers
  User ||--o{ AuditLog : acts
  Course ||--o{ Order : sold
```

### 3.2 Prisma Schema (ร่างฉบับเต็ม)
> ไฟล์จริงจะอยู่ที่ `prisma/schema.prisma` ส่วน connection URL กำหนดใน `prisma.config.ts` และตาราง `User`/`Session`/`Account`/`Verification` ตั้งตามรูปแบบที่ Better Auth ต้องการ

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ───────────── Enums ─────────────
enum Role {
  SUPER_ADMIN
  DEPT_ADMIN
  INSTRUCTOR
  STUDENT
}
enum CourseStatus {
  DRAFT
  PENDING_REVIEW
  PUBLISHED
  ARCHIVED
}
enum Visibility {
  PUBLIC
  INTERNAL
}
enum EnrollPolicy {
  OPEN
  APPROVAL
  INVITE_ONLY
}
enum InstructorRole {
  OWNER
  ASSISTANT
}
enum LessonType {
  VIDEO
  PDF
  TEXT
  LIVE
  QUIZ
  ASSIGNMENT
}
enum VideoSource {
  UPLOAD
  YOUTUBE
  VIMEO
}
enum AssetKind {
  VIDEO
  PDF
  IMAGE
  FILE
}
enum AssetStatus {
  UPLOADING
  READY
  FAILED
}
enum EnrollmentStatus {
  PENDING
  ACTIVE
  COMPLETED
  EXPIRED
  DROPPED
}
enum EnrollmentSource {
  SELF
  ADMIN
  IMPORT
  PURCHASE
}
enum QuestionType {
  SINGLE
  MULTIPLE
  TRUE_FALSE
  MATCHING
  SHORT_TEXT
  ESSAY
}
enum ShowAnswers {
  IMMEDIATELY
  AFTER_CLOSE
  NEVER
}
enum AttemptStatus {
  IN_PROGRESS
  SUBMITTED
  GRADED
}
enum SubmissionStatus {
  SUBMITTED
  GRADED
  RETURNED
}
enum GradeSource {
  QUIZ
  ASSIGNMENT
  MANUAL
}
enum AnnouncementScope {
  GLOBAL
  DEPARTMENT
  COURSE
}
enum NotificationType {
  ENROLLED
  ANNOUNCEMENT
  GRADED
  DUE_SOON
  LIVE_SOON
  QA_REPLY
  CERTIFICATE
  SYSTEM
}
enum ScreenEvent {
  PRINTSCREEN
  SHORTCUT
  CONTEXT_MENU
  COPY
  BLUR
  PRINT
  DEVTOOLS
}
enum OrderStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

// ───────────── Auth (Better Auth) ─────────────
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(STUDENT)
  banned        Boolean   @default(false)
  banReason     String?
  banExpires    DateTime?
  phone         String?
  externalId    String?   // รหัสนักศึกษา/พนักงาน
  departmentId  String?
  department    Department? @relation(fields: [departmentId], references: [id])
  notifyPrefs   Json      @default("{}")
  pdpaConsentAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  accounts      Account[]
  teaching      CourseInstructor[]
  enrollments   Enrollment[]
  attempts      QuizAttempt[]
  submissions   Submission[]
  grades        Grade[]
  certificates  Certificate[]
  threads       Thread[]
  posts         Post[]
  reviews       Review[]
  notifications Notification[]
  lineLink      LineLink?
  screenEvents  ScreenEventLog[]
  auditLogs     AuditLog[]
  assets        Asset[]
  announcements Announcement[]
  orders        Order[]

  @@index([role])
  @@index([departmentId])
}

model Session {
  id             String   @id @default(cuid())
  token          String   @unique
  expiresAt      DateTime
  ipAddress      String?
  userAgent      String?
  impersonatedBy String?
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([userId])
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String    // "google" | "credential"
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?   // hash (credential provider)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  @@unique([providerId, accountId])
  @@index([userId])
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([identifier])
}

// ───────────── Organization ─────────────
model Department {
  id        String       @id @default(cuid())
  code      String       @unique
  name      String
  parentId  String?
  parent    Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children  Department[] @relation("DeptTree")
  users     User[]
  courses   Course[]
  announcements Announcement[]
  createdAt DateTime     @default(now())
}

model Category {
  id       String     @id @default(cuid())
  slug     String     @unique
  name     String
  parentId String?
  parent   Category?  @relation("CatTree", fields: [parentId], references: [id])
  children Category[] @relation("CatTree")
  courses  Course[]
}

// ───────────── Course & Content ─────────────
model Course {
  id                 String       @id @default(cuid())
  slug               String       @unique
  title              String
  summary            String?
  description        Json?        // Tiptap JSON
  coverKey           String?
  level              String?
  status             CourseStatus @default(DRAFT)
  visibility         Visibility   @default(INTERNAL)
  enrollPolicy       EnrollPolicy @default(OPEN)
  sequential         Boolean      @default(false)
  price              Decimal?     @db.Decimal(10, 2) // เฟส 2
  protectionEnabled  Boolean      @default(true)
  completionRule     Json         @default("{\"minProgress\":100}") // {minProgress, requireQuizPass, minScore}
  gradingScheme      Json?        // [{grade:"A",min:80},...]
  certificateEnabled Boolean      @default(false)
  certificateTemplate Json?
  gradeScale         Json?        // S2 — [{grade:"A",min:80},…] ว่าง = เกณฑ์ตั้งต้น
  departmentId       String?
  department         Department?  @relation(fields: [departmentId], references: [id])
  categoryId         String?
  category           Category?    @relation(fields: [categoryId], references: [id])
  publishedAt        DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  instructors   CourseInstructor[]
  sections      Section[]
  enrollments   Enrollment[]
  questions     Question[]
  quizzes       Quiz[]
  assignments   Assignment[]
  gradeItems    GradeItem[]
  certificates  Certificate[]
  announcements Announcement[]
  threads       Thread[]
  reviews       Review[]
  orders        Order[]

  @@index([status, visibility])
  @@index([departmentId])
  @@index([categoryId])
}

model CourseInstructor {
  courseId String
  userId   String
  role     InstructorRole @default(OWNER)
  course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([courseId, userId])
}

model Section {
  id       String   @id @default(cuid())
  courseId String
  course   Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title    String
  position Int
  lessons  Lesson[]
  @@index([courseId, position])
}

model Lesson {
  id           String      @id @default(cuid())
  sectionId    String
  section      Section     @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  title        String
  type         LessonType
  position     Int
  isPreview    Boolean     @default(false)
  content      Json?       // TEXT: Tiptap JSON
  videoSource  VideoSource?
  videoUrl     String?     // YouTube/Vimeo
  assetId      String?     // VIDEO(UPLOAD)/PDF
  asset        Asset?      @relation("LessonAsset", fields: [assetId], references: [id])
  durationSec  Int?
  liveUrl      String?
  liveStartAt  DateTime?
  liveEndAt    DateTime?
  recordingUrl String?
  attachments  LessonAttachment[]
  progress     LessonProgress[]
  quiz         Quiz?
  assignment   Assignment?
  threads      Thread[]
  screenEvents ScreenEventLog[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([sectionId, position])
}

model Asset {
  id           String      @id @default(cuid())
  key          String      @unique // object key ใน storage
  kind         AssetKind
  mime         String
  size         BigInt
  originalName String
  status       AssetStatus @default(UPLOADING)
  uploadedById String
  uploadedBy   User        @relation(fields: [uploadedById], references: [id])
  lessons      Lesson[]    @relation("LessonAsset")
  attachments  LessonAttachment[]
  submissionFiles SubmissionFile[]
  createdAt    DateTime    @default(now())
}

model LessonAttachment {
  id           String  @id @default(cuid())
  lessonId     String
  lesson       Lesson  @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  assetId      String
  asset        Asset   @relation(fields: [assetId], references: [id])
  downloadable Boolean @default(false)
}

// ───────────── Enrollment & Progress ─────────────
model Enrollment {
  id           String           @id @default(cuid())
  userId       String
  courseId     String
  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  course       Course           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  status       EnrollmentStatus @default(ACTIVE)
  source       EnrollmentSource @default(SELF)
  progressPct  Int              @default(0)
  lastLessonId String?
  expiresAt    DateTime?
  enrolledAt   DateTime         @default(now())
  completedAt  DateTime?
  progress     LessonProgress[]
  @@unique([userId, courseId])
  @@index([courseId, status])
}

model LessonProgress {
  id              String     @id @default(cuid())
  enrollmentId    String
  lessonId        String
  enrollment      Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  lesson          Lesson     @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  completed       Boolean    @default(false)
  lastPositionSec Int        @default(0)
  completedAt     DateTime?
  updatedAt       DateTime   @updatedAt
  @@unique([enrollmentId, lessonId])
}

// ───────────── Quiz ─────────────
model Question {
  id          String       @id @default(cuid())
  courseId    String
  course      Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  type        QuestionType
  prompt      Json
  explanation Json?
  points      Decimal      @default(1) @db.Decimal(6, 2)
  tags        String[]
  archivedAt  DateTime?    // S1 — เก็บเข้าคลังแทนการลบ (Answer cascade)
  choices     Choice[]
  quizLinks   QuizQuestion[]
  answers     Answer[]
  createdAt   DateTime     @default(now())
  @@index([courseId])
}

model Choice {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  text       String
  isCorrect  Boolean  @default(false)
  matchKey   String?  // สำหรับ MATCHING
  position   Int
}

model Quiz {
  id               String      @id @default(cuid())
  courseId         String
  course           Course      @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lessonId         String?     @unique
  lesson           Lesson?     @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  title            String
  timeLimitMin     Int?
  maxAttempts      Int?        // null = ไม่จำกัด
  shuffleQuestions Boolean     @default(true)
  shuffleChoices   Boolean     @default(true)
  randomPool       Json?       // [{tag:"บทที่1", count:10}]
  passingPct       Int         @default(60)
  showAnswers      ShowAnswers @default(AFTER_CLOSE)
  availableFrom    DateTime?
  availableUntil   DateTime?
  questions        QuizQuestion[]
  attempts         QuizAttempt[]
  gradeItem        GradeItem?
}

model QuizQuestion {
  quizId     String
  questionId String
  position   Int
  quiz       Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@id([quizId, questionId])
}

model QuizAttempt {
  id            String        @id @default(cuid())
  quizId        String
  userId        String
  quiz          Quiz          @relation(fields: [quizId], references: [id], onDelete: Cascade)
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  attemptNo     Int
  questionOrder Json          // snapshot ลำดับข้อและตัวเลือกที่สุ่มได้
  status        AttemptStatus @default(IN_PROGRESS)
  startedAt     DateTime      @default(now())
  expiresAt     DateTime?
  submittedAt   DateTime?
  score         Decimal?      @db.Decimal(8, 2)
  maxScore      Decimal?      @db.Decimal(8, 2)
  passed        Boolean?
  answers       Answer[]
  @@unique([quizId, userId, attemptNo])
}

model Answer {
  id         String      @id @default(cuid())
  attemptId  String
  questionId String
  attempt    QuizAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question   Question    @relation(fields: [questionId], references: [id], onDelete: Cascade)
  response   Json
  isCorrect  Boolean?
  score      Decimal?    @db.Decimal(6, 2)
  feedback   String?
  @@unique([attemptId, questionId])
}

// ───────────── Assignment ─────────────
model Assignment {
  id            String    @id @default(cuid())
  courseId      String
  course        Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lessonId      String?   @unique
  lesson        Lesson?   @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  title         String
  instructions  Json
  dueAt         DateTime?
  allowLate     Boolean   @default(true)
  maxScore      Decimal   @db.Decimal(8, 2)
  allowedTypes  String[]  // ["pdf","docx","zip"]
  maxFileMb     Int       @default(20)
  submissions   Submission[]
  gradeItem     GradeItem?
}

model Submission {
  id           String           @id @default(cuid())
  assignmentId String
  userId       String
  assignment   Assignment       @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  attemptNo    Int              @default(1)
  text         String?
  files        SubmissionFile[]
  isLate       Boolean          @default(false)
  status       SubmissionStatus @default(SUBMITTED)
  score        Decimal?         @db.Decimal(8, 2)
  feedback     String?
  gradedById   String?
  gradedAt     DateTime?
  returnedAt   DateTime?        // S4 — ส่งกลับให้แก้ (เปิดส่งใหม่แม้เลยกำหนด)
  submittedAt  DateTime         @default(now())
  @@unique([assignmentId, userId, attemptNo])
  @@index([assignmentId, status])
}

model SubmissionFile {
  submissionId String
  assetId      String
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  asset        Asset      @relation(fields: [assetId], references: [id])
  @@id([submissionId, assetId])
}

// ───────────── Gradebook & Certificate ─────────────
model GradeItem {
  id           String      @id @default(cuid())
  courseId     String
  course       Course      @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title        String
  source       GradeSource
  quizId       String?     @unique
  quiz         Quiz?       @relation(fields: [quizId], references: [id], onDelete: Cascade)
  assignmentId String?     @unique
  assignment   Assignment? @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  weight       Decimal     @db.Decimal(5, 2) // %
  maxScore     Decimal     @db.Decimal(8, 2)
  position     Int
  grades       Grade[]
}

model Grade {
  id          String    @id @default(cuid())
  gradeItemId String
  userId      String
  gradeItem   GradeItem @relation(fields: [gradeItemId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  score       Decimal?  @db.Decimal(8, 2)
  overridden  Boolean   @default(false) // S3 — ผู้สอนแก้มือ ผลสอบใหม่ไม่ทับ
  updatedAt   DateTime  @updatedAt
  @@unique([gradeItemId, userId])
}

model Certificate {
  id        String    @id @default(cuid())
  code      String    @unique // เช่น LMS-2026-8F3K2Q
  userId    String
  courseId  String
  user      User      @relation(fields: [userId], references: [id])
  course    Course    @relation(fields: [courseId], references: [id])
  pdfKey    String?
  issuedAt  DateTime  @default(now())
  revokedAt DateTime?
  revokeReason String?
  @@unique([userId, courseId])
}

// ───────────── Communication ─────────────
model Announcement {
  id           String            @id @default(cuid())
  scope        AnnouncementScope
  courseId     String?
  course       Course?           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  departmentId String?
  department   Department?       @relation(fields: [departmentId], references: [id])
  authorId     String
  author       User              @relation(fields: [authorId], references: [id])
  title        String
  body         Json
  pinned       Boolean           @default(false)
  publishedAt  DateTime          @default(now())
  @@index([scope, publishedAt])
}

model Thread {
  id         String   @id @default(cuid())
  courseId   String
  lessonId   String?
  course     Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lesson     Lesson?  @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  authorId   String
  author     User     @relation(fields: [authorId], references: [id])
  title      String
  body       String
  isResolved Boolean  @default(false)
  isPinned   Boolean  @default(false)
  isHidden   Boolean  @default(false)
  posts      Post[]
  createdAt  DateTime @default(now())
  @@index([courseId, lessonId])
}

model Post {
  id        String   @id @default(cuid())
  threadId  String
  thread    Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  parentId  String?
  body      String
  isAnswer  Boolean  @default(false)
  isHidden  Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Review {
  id        String   @id @default(cuid())
  courseId  String
  userId    String
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int      // 1..5 (ตรวจด้วย Zod + CHECK constraint)
  comment   String?
  reply     String?
  isHidden  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([courseId, userId])
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String?
  link      String?
  readAt    DateTime?
  createdAt DateTime         @default(now())
  @@index([userId, readAt])
}

model LineLink {
  userId     String   @id
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  lineUserId String   @unique
  linkedAt   DateTime @default(now())
}

// ───────────── Security & Governance ─────────────
model ScreenEventLog {
  id        String      @id @default(cuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  lessonId  String?
  lesson    Lesson?     @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  event     ScreenEvent
  meta      Json?
  ip        String?
  userAgent String?
  createdAt DateTime    @default(now())
  @@index([userId, createdAt])
  @@index([event, createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  actor     User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  action    String   // เช่น "user.role.update", "grade.update"
  entity    String
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorId, createdAt])
}

model SystemSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}

// ───────────── Commerce (เฟส 2 — สร้างตารางไว้ก่อน) ─────────────
model Order {
  id          String      @id @default(cuid())
  userId      String
  courseId    String
  user        User        @relation(fields: [userId], references: [id])
  course      Course      @relation(fields: [courseId], references: [id])
  amount      Decimal     @db.Decimal(10, 2)
  discount    Decimal     @default(0) @db.Decimal(10, 2)
  couponCode  String?
  status      OrderStatus @default(PENDING)
  provider    String?
  providerRef String?     @unique
  paidAt      DateTime?
  createdAt   DateTime    @default(now())
}

model Coupon {
  code        String    @id
  percentOff  Int?
  amountOff   Decimal?  @db.Decimal(10, 2)
  maxUses     Int?
  usedCount   Int       @default(0)
  validUntil  DateTime?
  courseId    String?
}
```

### 3.3 กติกาข้อมูลที่สำคัญ
- **ID:** ใช้ `cuid()` ทุกตาราง ไม่เปิดเผย id แบบลำดับเลข
- **Soft delete:** คอร์สใช้ `status = ARCHIVED` แทนการลบ ส่วนผู้ใช้ใช้ `banned` สำหรับระงับ และการลบบัญชีตาม PDPA ใช้วิธี anonymize
- **Snapshot:** `QuizAttempt.questionOrder` เก็บลำดับข้อที่สุ่มได้ เพื่อให้ผลสอบคงเดิมแม้ผู้สอนจะแก้คลังข้อสอบภายหลัง
- **Progress:** คำนวณ `Enrollment.progressPct` ใหม่ทุกครั้งที่ `LessonProgress.completed` เปลี่ยน (ภายใน transaction)
- **Timezone:** เก็บเป็น UTC ทั้งหมด และแสดงผลเป็น `Asia/Bangkok` ด้วยปีแบบ พ.ศ.

---

## 4. Authorization Design

### 4.1 Permission Matrix
| ความสามารถ | Super Admin | Dept Admin | Instructor | Student | Guest |
|---|:-:|:-:|:-:|:-:|:-:|
| ตั้งค่าระบบ / audit log | ✅ | — | — | — | — |
| จัดการคณะ / หมวดหมู่ | ✅ | — | — | — | — |
| จัดการผู้ใช้ | ✅ ทั้งหมด | ✅ ในคณะ | — | — | — |
| เปลี่ยน role | ✅ | ✅ ≤ Instructor ในคณะ | — | — | — |
| สร้างคอร์ส | ✅ | ✅ | ✅ | — | — |
| แก้ไขคอร์ส | ✅ | ✅ ในคณะ | ✅ คอร์สที่ตนสอน | — | — |
| อนุมัติเผยแพร่คอร์ส | ✅ | ✅ ในคณะ | — | — | — |
| ลงทะเบียนผู้เรียนแบบกลุ่ม | ✅ | ✅ | ✅ คอร์สตน | — | — |
| ตรวจงาน / แก้คะแนน | ✅ | ✅ ในคณะ | ✅ คอร์สตน | — | — |
| เรียน / ทำแบบทดสอบ / ส่งงาน | — | — | — | ✅ ที่ลงทะเบียนแล้ว | — |
| ดูบทเรียน preview / catalog | ✅ | ✅ | ✅ | ✅ | ✅ (เฉพาะ PUBLIC) |
| ประกาศ | ✅ GLOBAL | ✅ DEPARTMENT | ✅ COURSE | — | — |
| Q&A ตั้งคำถาม / ตอบ | ✅ | ✅ | ✅ | ✅ | — |
| ซ่อนกระทู้ / รีวิว | ✅ | ✅ ในคณะ | ✅ คอร์สตน | — | — |
| รีวิวคอร์ส | — | — | — | ✅ เรียน ≥ 30% | — |
| รายงาน | ✅ ทั้งหมด | ✅ คณะ | ✅ คอร์สตน | ✅ ของตน | — |
| ดูรายงาน ScreenEventLog | ✅ | ✅ คณะ | — | — | — |

### 4.2 กลไกการตรวจสิทธิ์ (Defense in depth)
```mermaid
flowchart LR
  req[Request] --> P{proxy.ts<br/>มี session cookie?}
  P -- ไม่มี + route ต้อง login --> L[redirect /login?next=...]
  P -- มี / public --> R[Page / Action / Route Handler]
  R --> D{"DAL: requireUser()<br/>requireRole()<br/>can(user, action, resource)"}
  D -- ไม่ผ่าน --> F["forbidden() / notFound()"]
  D -- ผ่าน --> Q[(Prisma query<br/>+ where scope)]
```
- `proxy.ts` ตรวจแบบ **optimistic** (อ่านจาก cookie เท่านั้น ไม่ query DB) ทำให้เร็ว และใช้ redirect ผู้ที่ยังไม่ login
- `src/lib/rbac.ts` เป็นจุดเดียวที่ตรวจสิทธิ์ (ส่วนที่เป็นฟังก์ชัน pure และ client ใช้ร่วมได้อยู่ใน `src/lib/roles.ts` แล้ว re-export ผ่าน `rbac.ts`; `src/lib/permissions.ts` แปลง matrix นี้ให้ Better Auth admin plugin รู้จัก):
  ```ts
  export async function requireUser(): Promise<SessionUser>           // ไม่มี session → redirect("/login")
  export async function requireRole(...roles: Role[]): Promise<SessionUser> // ไม่ตรง → forbidden()
  export function can(user: SessionUser, action: Action, res: Resource): boolean
  export async function assertCourseAccess(userId: string, courseId: string, level: "learn"|"teach"|"manage")
  ```
- ทุก `queries.ts`/`actions.ts` ต้องเรียก `requireUser`/`assertCourseAccess` เป็นบรรทัดแรก และมี ESLint rule แบบกำหนดเอง หรือ code review checklist คอยบังคับ

### 4.3 Route Map
| กลุ่ม (route group) | Path | สิทธิ์ |
|---|---|---|
| `(public)` | `/`, `/courses`, `/courses/[slug]`, `/verify/[code]` | ทุกคน |
| `(auth)` | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | ยังไม่ login |
| `(learn)` | `/dashboard`, `/my-courses`, `/learn/[courseId]/[lessonId]`, `/learn/[courseId]/grades`, `/quiz/[attemptId]`, `/certificates`, `/notifications`, `/announcements`, `/settings/*` | login แล้ว |
| `(instructor)` | `/teach`, `/teach/courses/[id]/{edit,curriculum,students,questions,quizzes,assignments,gradebook,qa,announcements}` | INSTRUCTOR+ |
| `(admin)` | `/admin`, `/admin/{users,departments,categories,courses,announcements,reports,screen-events,audit,settings}` | DEPT_ADMIN+ (บางหน้าเฉพาะ SUPER_ADMIN) |
| API | `/api/auth/[...all]` (Better Auth), `/api/upload/{presign,complete}`, `/api/media/[assetId]`, `/api/submission-file/[assetId]`, `/api/certificate/[code]`, `/api/events/screen`, `/api/line/webhook`, `/api/cron/{reminders,live}`, `/api/health` | ตามแต่ละ endpoint |

---

## 5. Key Flows (Sequence Diagrams)

### 5.1 Login ด้วย Google
```mermaid
sequenceDiagram
  actor U as ผู้ใช้
  participant B as Browser
  participant A as Next.js /api/auth
  participant G as Google OAuth
  participant DB as PostgreSQL
  U->>B: กด "เข้าสู่ระบบด้วย Google"
  B->>A: authClient.signIn.social({provider:"google"})
  A-->>B: redirect → Google (state, PKCE)
  B->>G: consent
  G-->>B: redirect /api/auth/callback/google?code
  B->>A: callback
  A->>G: แลก code → tokens + profile
  A->>DB: upsert User (role=STUDENT ถ้าใหม่), Account(google), Session
  A-->>B: Set-Cookie session (HttpOnly, Secure, SameSite=Lax)
  B->>B: redirect ไป next หรือ /dashboard
```

### 5.2 Login ด้วย Email/Password (+ ยืนยันอีเมล)
```mermaid
sequenceDiagram
  actor U as ผู้ใช้
  participant B as Browser
  participant A as /api/auth
  participant DB as PostgreSQL
  participant M as Email
  U->>B: สมัคร (ชื่อ, อีเมล, รหัสผ่าน, consent)
  B->>A: signUp.email
  A->>DB: create User + Account(credential, hash scrypt)
  A->>M: ส่งลิงก์ยืนยัน (Verification token)
  U->>A: คลิกลิงก์ /api/auth/verify-email?token
  A->>DB: emailVerified = true
  U->>B: login
  B->>A: signIn.email (rate limited)
  A->>DB: ตรวจ hash → create Session
  A-->>B: Set-Cookie session
```

### 5.3 ลงทะเบียน → เรียน → บันทึกความคืบหน้า
```mermaid
sequenceDiagram
  actor S as ผู้เรียน
  participant P as Course page (RSC)
  participant SA as Server Action enroll()
  participant L as Learn page
  participant API as /api/media/[assetId]
  participant S3 as Object Storage
  participant DB as PostgreSQL
  S->>P: กด "ลงทะเบียน"
  P->>SA: enroll(courseId)
  SA->>DB: ตรวจ policy (OPEN→ACTIVE / APPROVAL→PENDING)
  SA->>DB: create Enrollment + Notification
  SA-->>S: redirect /learn/{courseId}/{firstLesson}
  S->>L: เปิดบทเรียนวิดีโอ
  L->>DB: assertCourseAccess(learn), ตรวจ sequential lock
  L->>API: ขอ URL สตรีม
  API->>DB: ตรวจ enrollment ACTIVE
  API->>S3: presign GET (TTL 5 นาที)
  API-->>L: signed URL
  L->>S3: HTTP Range streaming
  loop ทุก 15 วินาที / เมื่อ pause
    L->>SA: saveProgress(lessonId, positionSec)
    SA->>DB: upsert LessonProgress
  end
  L->>SA: markComplete (ดูถึง ≥ 90%)
  SA->>DB: tx: LessonProgress.completed, คำนวณ progressPct ใหม่
  SA->>SA: ตรวจ completionRule → ถ้าผ่าน ไป flow 5.6
```

### 5.4 ทำแบบทดสอบ (จับเวลาฝั่ง server)
```mermaid
sequenceDiagram
  actor S as ผู้เรียน
  participant SA as Server Actions
  participant DB as PostgreSQL
  S->>SA: startAttempt(quizId)
  SA->>DB: ตรวจเวลาเปิด-ปิด, maxAttempts
  SA->>DB: สุ่มข้อจาก randomPool / shuffle → create QuizAttempt(questionOrder, expiresAt)
  SA-->>S: redirect /quiz/{attemptId} (ไม่ส่งเฉลยมาที่ client)
  loop ระหว่างทำ
    S->>SA: saveAnswer(attemptId, questionId, response)
    SA->>DB: ตรวจ now < expiresAt → upsert Answer
  end
  alt ผู้เรียนกดส่ง หรือหมดเวลา (client auto-submit / cron ปิด attempt ที่ค้าง)
    S->>SA: submitAttempt(attemptId)
    SA->>DB: ตรวจอัตโนมัติ (ยกเว้น ESSAY) → score, passed
    SA->>DB: status = SUBMITTED หรือ GRADED, sync Grade
    SA-->>S: ผลลัพธ์ตาม showAnswers
  end
```

### 5.5 ส่งงาน (Assignment) และตรวจงาน
```mermaid
sequenceDiagram
  actor S as ผู้เรียน
  actor I as ผู้สอน
  participant U as /api/upload
  participant S3 as Object Storage
  participant SA as Server Actions
  participant DB as PostgreSQL
  participant N as Notify service
  S->>U: presign(filename, mime, size)
  U->>DB: ตรวจชนิด/ขนาดตาม Assignment, create Asset(UPLOADING)
  U-->>S: presigned PUT URL
  S->>S3: PUT file
  S->>U: complete(assetId) → HEAD object ตรวจขนาด → READY
  S->>SA: submit(assignmentId, text, assetIds)
  SA->>DB: create Submission (isLate = now > dueAt)
  SA->>N: แจ้งผู้สอน
  I->>SA: grade(submissionId, score, feedback)
  SA->>DB: update Submission + upsert Grade + AuditLog
  SA->>N: แจ้งผู้เรียน (in-app / email / LINE)
```

### 5.6 ออกใบประกาศนียบัตร
```mermaid
sequenceDiagram
  participant SA as completion check
  participant DB as PostgreSQL
  participant PDF as @react-pdf/renderer
  participant S3 as Object Storage
  participant N as Notify
  SA->>DB: ตรวจ completionRule (progress, quiz pass, คะแนนรวม)
  SA->>DB: Enrollment.status = COMPLETED
  SA->>DB: create Certificate(code สุ่ม ไม่ซ้ำ)
  SA->>PDF: render template + QR (/verify/{code})
  PDF->>S3: put certificates/{code}.pdf
  SA->>DB: Certificate.pdfKey
  SA->>N: แจ้ง "ได้รับใบประกาศ"
  Note over DB: หน้า /verify/{code} (public) แสดงชื่อ คอร์ส วันที่ และสถานะว่าถูกเพิกถอนหรือไม่
```

### 5.7 ผูกบัญชีและแจ้งเตือนผ่าน LINE
```mermaid
sequenceDiagram
  actor U as ผู้ใช้
  participant W as Web /settings/notifications
  participant DB as PostgreSQL
  participant LINE as LINE Platform
  participant WH as /api/line/webhook
  participant C as /api/cron/reminders
  U->>W: กด "เชื่อมต่อ LINE"
  W->>DB: create Verification(code 6 หลัก, TTL 10 นาที)
  W-->>U: แสดง QR เพิ่มเพื่อน + รหัส
  U->>LINE: add friend แล้วพิมพ์รหัส
  LINE->>WH: message event (ตรวจ X-Line-Signature)
  WH->>DB: ตรวจรหัส → create LineLink(userId, lineUserId)
  WH->>LINE: reply "เชื่อมต่อสำเร็จ"
  Note over C: ทำงานทุกชั่วโมง (Bearer CRON_SECRET)
  C->>DB: หางานที่ครบกำหนดใน 24 ชม. หรือ Live ที่จะเริ่มใน 1 ชม. ที่ยังไม่เคยแจ้ง
  C->>LINE: push message
  C->>DB: บันทึก Notification (กันส่งซ้ำ)
  LINE->>WH: unfollow event → ลบ LineLink
```

### 5.8 อัปโหลดวิดีโอขนาดใหญ่ (ผู้สอน)
```mermaid
sequenceDiagram
  actor I as ผู้สอน
  participant U as /api/upload
  participant S3 as Object Storage
  participant DB as PostgreSQL
  I->>U: presign(multipart, size, mime=video/*)
  U->>DB: create Asset(UPLOADING)
  U->>S3: CreateMultipartUpload
  U-->>I: uploadId + presigned URL ของแต่ละ part (10MB)
  par อัปโหลดขนานกัน 3–4 part
    I->>S3: PUT part N
  end
  I->>U: complete(parts ETag)
  U->>S3: CompleteMultipartUpload
  U->>DB: Asset.status = READY
```

---

## 6. Content Protection Design (M15)

### 6.1 ชั้นการป้องกัน
```mermaid
flowchart TB
  subgraph L1["ชั้น 1: เข้าถึงไฟล์ (Server)"]
    a1[ตรวจ enrollment ก่อนออก URL]
    a2[Signed URL อายุ ≤ 5 นาที]
    a3[ไม่มี public bucket / ไม่เปิดเผย object key]
  end
  subgraph L2["ชั้น 2: การแสดงผล (Client)"]
    b1[PDF → canvas ผ่าน pdf.js ไม่มี text layer]
    b2[video: nodownload, disablePictureInPicture]
    b3[user-select none, ปิด drag / context menu]
    b4["@media print → ซ่อนเนื้อหา"]
  end
  subgraph L3["ชั้น 3: ยับยั้ง (Client)"]
    c1[ดักคีย์ PrintScreen / Ctrl+P,S,U / F12 / Win+Shift+S]
    c2[blur / visibilitychange → เบลอเนื้อหา]
    c3[DevTools heuristic → ซ่อนเนื้อหา]
    c4[ล้าง clipboard เมื่อกด PrintScreen]
  end
  subgraph L4["ชั้น 4: ตามรอย"]
    d1[Dynamic watermark: ชื่อ · อีเมล · เวลา]
    d2[ScreenEventLog → รายงานแอดมิน]
  end
  L1 --> L2 --> L3 --> L4
```

### 6.2 ส่วนประกอบ `<ProtectedViewer>`
```tsx
// src/components/protected-viewer/protected-viewer.tsx  ("use client")
<ProtectedViewer
  enabled={course.protectionEnabled && settings.protection}
  watermark={{ name: user.name, id: user.email, }}
  lessonId={lesson.id}
>
  <VideoPlayer /> | <PdfCanvasViewer /> | <RichTextRenderer />
</ProtectedViewer>
```
- **Watermark:** ใช้ `<div>` ทับเต็มพื้นที่ `pointer-events:none` ข้อความซ้ำหลายจุด หมุน -25° ความโปร่ง 12–18% สุ่มตำแหน่งใหม่ทุก 20–30 วินาที ถ้ามีการลบ element ออกจาก DOM จะใช้ `MutationObserver` สร้างกลับมาใหม่
- **Fullscreen:** ต้องให้ watermark อยู่ในวิดีโอด้วย จึงสั่ง fullscreen ที่ container แทนการใช้ `<video>` fullscreen เดิม
- **Event reporting:** รวม event ส่งเป็นชุด (debounce 5 วินาที) ไปที่ `/api/events/screen` ด้วย `navigator.sendBeacon` และจำกัดความถี่ (rate limit) ต่อผู้ใช้
- **มือถือ:** iOS/Android ไม่มี event ให้ตรวจจับ screenshot บนเว็บ จึงพึ่ง watermark และการเบลอเมื่อสลับแอปเป็นหลัก

### 6.3 ข้อจำกัด (ยืนยันแล้วกับเจ้าของระบบ)
การจับภาพระดับ OS, การอัดหน้าจอ และการถ่ายด้วยกล้อง **ป้องกันไม่ได้ 100%** บนเว็บ ถ้าต้องการให้วิดีโอเป็นจอดำเมื่อจับภาพ ต้องใช้ DRM (Widevine/FairPlay ผ่านผู้ให้บริการอย่าง Mux, Bunny Stream หรือ VdoCipher) ซึ่งเป็นตัวเลือกในเฟส 4

---

## 7. Notification Architecture
```mermaid
flowchart LR
  ev[Domain event<br/>เช่น submission.graded] --> ns["notify(userId, type, payload)"]
  ns --> pref{notifyPrefs<br/>ของผู้ใช้}
  pref --> inapp[(Notification table)]
  pref --> email[Email adapter<br/>Resend / SMTP]
  pref --> line[LINE adapter<br/>push API]
```
- `src/lib/notify/index.ts` เป็นจุดเดียวที่เรียกใช้ และเลือก adapter ตามการตั้งค่าของผู้ใช้
  (Phase 1 มีแค่ in-app: ตัด id ซ้ำ, INSERT ชุดละ 1,000 แถว, ไม่ throw ให้งานหลักล้ม)
- **ประกาศ (FR-11.1)** สร้างแถว `Notification` ชนิด `ANNOUNCEMENT` ให้ผู้รับทุกคนตอนเผยแพร่ ลิงก์ไปที่ `/announcements#a-<id>`
  | ระดับ | ผู้ประกาศ | ผู้รับ |
  |---|---|---|
  | `GLOBAL` | Super Admin | ผู้ใช้ทุกคนที่ไม่ถูกระงับ |
  | `DEPARTMENT` | Super Admin (ทุกคณะ) · Dept Admin (คณะตน) | ผู้ใช้ที่ `departmentId` ตรงกับคณะนั้น (ไม่รวมคณะย่อย) |
  | `COURSE` | ผู้สอนของคอร์ส · ผู้ดูแลคณะเจ้าของคอร์ส | ผู้เรียน `ACTIVE` ที่ยังไม่หมดอายุ |

  แก้ไขประกาศไม่แจ้งซ้ำและเปลี่ยนกลุ่มผู้รับไม่ได้ · ลบประกาศแล้วลบการแจ้งเตือนที่ชี้มาด้วย
- เฟส 1 ส่ง email/LINE แบบ fire-and-forget หลัง commit ด้วย `after()` ของ Next.js ถ้าปริมาณมากขึ้น ให้เพิ่ม job queue (เช่น pg-boss บน PostgreSQL ตัวเดิม) โดยไม่ต้องเพิ่ม infra
- Cron endpoint ป้องกันด้วย header `Authorization: Bearer ${CRON_SECRET}`

---

## 8. UI / UX Design

### 8.1 Layout แบบ Responsive
| อุปกรณ์ | Navigation | หน้าเรียน (Player) |
|---|---|---|
| มือถือ < 768px | Top bar + **Bottom nav** (หน้าหลัก, คอร์สของฉัน, แจ้งเตือน, โปรไฟล์) | เนื้อหาเต็มจอ + สารบัญเป็น `Sheet` (drawer) |
| แท็บเล็ต 768–1023px | Sidebar ย่อเป็นไอคอน | สารบัญพับเก็บได้ |
| Desktop ≥ 1024px | Sidebar เต็ม (shadcn `Sidebar`) | 2 คอลัมน์: เนื้อหา + สารบัญ/Q&A |

### 8.2 Design tokens
- Tailwind v4 กำหนด token ใน `src/app/globals.css` ผ่าน `@theme` และตัวแปร CSS ของ shadcn (`--primary`, `--background`, …) รองรับ light/dark
- ฟอนต์ **Anuphan** สำหรับภาษาไทย + **Inter** สำหรับอังกฤษ/ตัวเลข (`--font-sans` ใน `globals.css`) และ **JetBrains Mono** สำหรับโค้ด (`--font-mono`)
  `line-height` ≥ 1.6 เพื่อให้วรรณยุกต์ภาษาไทยไม่ชนกัน
- Component พื้นฐานจาก shadcn/ui: Button, Card, Dialog, Sheet, Sidebar, Tabs, Table, Form, Input, Select, Badge, Progress, Toast (Sonner), Skeleton, Chart

### 8.3 หน้าจอหลัก (Screen inventory)
| Role | หน้าจอ |
|---|---|
| Guest | Landing, Catalog, Course detail, Login/Register, Verify certificate |
| Student | Dashboard, My courses, Player, Quiz taking/result, Assignment submit, Grades, Certificates, Notifications, Settings (profile, sessions, LINE) |
| Instructor | Teach dashboard, Course editor, Curriculum builder (drag & drop), Question bank, Quiz settings, Assignment grading, Gradebook, Students, Q&A inbox, Announcements |
| Admin | Admin dashboard, Users (+CSV import), Departments, Categories, Course approval, Reports, Screen events, Audit log, Settings |

---

## 9. Non-Functional Design

| NFR | แนวทาง |
|---|---|
| Security | CSP (`default-src 'self'`; อนุญาต frame เฉพาะ youtube/vimeo; media จากโดเมน storage), HSTS, `X-Frame-Options: DENY`, Better Auth rate limit, Zod validate ทุก input, render Tiptap JSON เป็น HTML ที่ allowlist แล้ว, ตรวจ MIME จาก magic bytes หลังอัปโหลด |
| Secrets | อยู่ใน env ทั้งหมด ไม่ commit และมี `.env.example` เป็นตัวอย่าง |
| Performance | RSC + streaming (`loading.tsx`), `next/image`, ใช้ cache สำหรับ catalog (`"use cache"` + `cacheTag` แล้ว revalidate เมื่อ publish), pagination แบบ cursor, index ตาม §3.2 |
| Scalability | แอป stateless, ใช้ connection pooling (PgBouncer/Neon pooler), ไฟล์ไม่ผ่าน app server (presigned) |
| Reliability | ใช้ transaction ในงานที่มีหลายขั้นตอน (grade, progress, certificate), idempotency ของ cron ด้วยการเช็ค Notification ที่เคยส่ง |
| Observability | `/api/health` (เช็ค DB), structured log (pino), Sentry (ทางเลือก), AuditLog |
| Backup | pg_dump รายวัน / snapshot ของผู้ให้บริการ และเปิด versioning ของ bucket (ทางเลือก) |
| Testing | Vitest (rbac, grading, progress calc), Playwright (login, enroll → learn, quiz, submit) บน viewport 375 และ 1280 |

---

## 10. Deployment Options (Hosting ยังไม่เลือก · Storage ตัดสินใจแล้ว — D-01)

> **D-01 (2026-09-20):** Storage ใช้ **MinIO** ตลอดการพัฒนา Phase 1 (มีใน `docker-compose.yml` อยู่แล้ว)
> แล้วสลับเป็น **Cloudflare R2** ตอน deploy โดยเปลี่ยนเฉพาะ `S3_*` ใน env — โค้ดฝั่งแอปคุยผ่าน S3 API
> ตัวเดียวกัน จึงต้องไม่มีที่ไหนอ้าง endpoint หรือ bucket ของ MinIO ตรง ๆ นอกจาก `src/lib/storage.ts`
>
> **D-04 (2026-09-20):** Phase 1 เสิร์ฟวิดีโอเป็น **MP4 ไฟล์เดียว** ผ่าน signed URL (progressive + HTTP range)
> ยังไม่ทำ transcode/HLS — ค่อยพิจารณาเมื่อพบปัญหาแบนด์วิดท์จริง `Asset` มีช่องเก็บ metadata พอสำหรับ
> เพิ่ม rendition ภายหลังโดยไม่ต้อง migrate ใหญ่

| | ตัวเลือก A: Managed | ตัวเลือก B: Self-host (Server สถาบัน) |
|---|---|---|
| App | Vercel | Docker (`output: "standalone"`) + Caddy/Nginx (HTTPS) |
| DB | Neon / Supabase Postgres | PostgreSQL container + volume |
| Storage | Cloudflare R2 (ไม่มีค่า egress) | MinIO |
| Cron | Vercel Cron | crontab / container `ofelia` |
| ข้อดี | ตั้งค่าเร็ว, scale อัตโนมัติ | ข้อมูลอยู่ในสถาบัน (PDPA), ค่าใช้จ่ายคงที่ |
| ข้อเสีย | ค่าใช้จ่ายผันตามปริมาณใช้งาน, ข้อมูลอยู่ต่างประเทศ | ต้องดูแล server และ backup เอง |

ทั้งสองแบบใช้โค้ดชุดเดียวกัน ต่างกันแค่ env ส่วน dev ใช้ `docker-compose.yml` (postgres + minio + mailpit)

### 10.1 Environment Variables
```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Database
DATABASE_URL=postgresql://lms:lms@localhost:5432/lms
# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Storage (S3-compatible)
S3_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_BUCKET=lms
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# Email
EMAIL_PROVIDER=smtp            # smtp | resend
SMTP_URL=smtp://localhost:1025
RESEND_API_KEY=
EMAIL_FROM="LMS <no-reply@example.com>"
# LINE
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
# Jobs
CRON_SECRET=

# Seed (prisma db seed) — บัญชี Super Admin ตั้งต้น
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

---

## 11. โครงสร้างโฟลเดอร์ (เป้าหมาย)
```
LMS/
├─ docs/                       spec.md, system-design.md, system-overview.html, CHANGELOG-REQUIREMENTS.md
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ prisma.config.ts
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (public)/  page.tsx, courses/, courses/[slug]/, verify/[code]/
│  │  ├─ (auth)/    login/, register/, forgot-password/, reset-password/
│  │  ├─ (learn)/   dashboard/, my-courses/, learn/[courseId]/[lessonId]/, quiz/[attemptId]/, certificates/, notifications/, announcements/, settings/
│  │  ├─ (instructor)/teach/...
│  │  ├─ (admin)/admin/...
│  │  ├─ api/       auth/[...all]/, upload/, media/[assetId]/, events/screen/, line/webhook/, cron/, health/
│  │  ├─ layout.tsx, globals.css, not-found.tsx, forbidden.tsx
│  ├─ components/
│  │  ├─ ui/                   (shadcn — ไม่แก้ด้วยมือ)
│  │  ├─ layout/               app-sidebar, bottom-nav, top-bar, user-menu
│  │  ├─ protected-viewer/     protected-viewer, watermark, use-anti-capture
│  │  └─ shared/               data-table, empty-state, rich-text, file-uploader
│  ├─ features/
│  │  ├─ auth/ users/ departments/ catalog/ course-builder/ content/ enrollment/
│  │  ├─ questions/ quiz/ assignment/ gradebook/ certificate/ announcements/ notifications/
│  │  ├─ line/ qa/ review/ protection/ reports/ audit/ settings/
│  │  │   └─ (แต่ละโฟลเดอร์) queries.ts · actions.ts · schemas.ts · components/ · lib/
│  ├─ lib/                     auth.ts, auth-client.ts, db.ts, rbac.ts (server), roles.ts (client-safe), permissions.ts,
│  │                          storage.ts, notify/, audit.ts, utils.ts, dates.ts, env.ts, mail.ts, action-result.ts,
│  │                          csv.ts, xlsx.ts (server), decimal.ts
│  └─ generated/prisma/        (gitignored)
├─ proxy.ts
├─ tests/
│  ├─ unit/                    Vitest — roles, csv, safe-next (และ grading/progress ในเฟสถัดไป)
│  └─ e2e/                     Playwright — viewport 375 และ 1280
├─ vitest.config.ts, playwright.config.ts
├─ .github/workflows/ci.yml    lint → typecheck → unit → migrate+seed → e2e
├─ docker-compose.yml
├─ .env.example
└─ package.json (pnpm)
```

---

## 12. แผนเริ่ม Implement — Phase 0 (เสร็จแล้ว 2026-09-20)
1. ✅ `pnpm create next-app@latest` (TypeScript, Tailwind, App Router, `src/`, ESLint, Turbopack) → `pnpm dlx shadcn@latest init`
2. ✅ ติดตั้ง Prisma, Better Auth, Zod → วาง `schema.prisma` ตาม §3.2 → `docker compose up` → `prisma migrate dev` → seed (Super Admin, คณะตัวอย่าง, คอร์สตัวอย่าง)
3. ✅ ทำ M01: auth config, หน้า login/register, `proxy.ts`, `lib/rbac.ts`, layout responsive แยกตาม role
4. ✅ `git init` + CI (lint, typecheck, unit, e2e) → **ส่งให้ผู้ใช้ตรวจ** ก่อนเริ่ม Phase 1

### สถานะการตรวจรับ Phase 0
| การตรวจ | ผล |
|---|---|
| `pnpm lint` | 0 error (เหลือ 3 warning จาก `react-hook-form` ที่ React Compiler memoize ไม่ได้) |
| `pnpm typecheck` | ผ่าน |
| `pnpm test` (Vitest) | 20 เคสผ่าน — roles/RBAC, safe-next, csv |
| `pnpm build` | สำเร็จ 19 routes |
| `prisma migrate deploy` + `db:seed` | สำเร็จ · `/api/health` ตอบ `db: up` |
| RBAC จริงบนเซิร์ฟเวอร์ | ผู้เรียนเข้า `/admin`, `/teach` ได้ 403 · ผู้ไม่ล็อกอินถูก redirect ไป `/login` |

**บัญชีจาก seed** — `admin@krirk.ac.th` (SUPER_ADMIN), `instructor@krirk.ac.th`, `student@krirk.ac.th` · รหัสผ่านมาจาก `SEED_ADMIN_PASSWORD` และต้องเปลี่ยนทันทีก่อนขึ้นระบบจริง
