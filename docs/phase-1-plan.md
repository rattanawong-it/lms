# Phase 1 — MVP: สร้างคอร์ส เรียน และป้องกันเนื้อหา

> **สถานะ: ร่างรออนุมัติ** · จัดทำ 2026-09-20 · ต่อจาก Phase 0 (commit `38e6963`)
> ขอบเขตตาม spec.md §6 — **M03, M04, M05, M06, M15, M11 (เฉพาะ in-app)**
> ทุกโมดูลต้องผ่าน DoD 7 ข้อตาม spec.md §3.0

---

## 1. การตัดสินใจที่ใช้เป็นฐานของแผนนี้

| # | เรื่อง | ข้อสรุป | ผลต่อการออกแบบ |
|---|---|---|---|
| D-01 | Storage | MinIO ตลอด Phase 1 → สลับเป็น Cloudflare R2 ตอน deploy ด้วยการเปลี่ยน `S3_*` | โค้ดทั้งหมดคุยผ่าน S3 API · `src/lib/storage.ts` เป็นที่เดียวที่รู้จัก endpoint/bucket |
| D-04 | วิดีโอ | MP4 ไฟล์เดียว (progressive + HTTP range) ยังไม่ transcode/HLS | ไม่ต้องมี worker/ffmpeg ใน Phase 1 · `Asset` มีที่ว่างพอสำหรับเพิ่ม rendition ภายหลัง |

**สิ่งที่ตามมาจาก D-01/D-04 และต้องยอมรับร่วมกัน**
- MinIO บน `localhost:9000` ยังไม่มี TLS — ใช้เฉพาะเครื่องพัฒนา ไม่ใช่ค่า default ของ production
- ไฟล์ MP4 ที่ผู้สอนอัปโหลดจะถูกเสิร์ฟตามขนาดจริง ผู้เรียนเน็ตช้าจะโหลดช้า เป็นข้อแลกเปลี่ยนที่รับไว้แล้ว
- ต้องกำหนด **เพดานขนาดไฟล์** ตั้งแต่ต้น (ข้อเสนอ: วิดีโอ 2 GB, PDF 50 MB, ไฟล์แนบ 25 MB) — รอยืนยัน

---

## 2. ลำดับงาน (7 ขั้น)

ออกแบบให้แต่ละขั้น **จบแล้วเห็นผลได้จริงบนหน้าจอ** และขั้นถัดไปพึ่งขั้นก่อนหน้าเท่านั้น
ทุกขั้นจบด้วย lint + typecheck + test + commit และหยุดให้ตรวจที่จุด ✋

### ขั้น 1 — Storage layer (พื้นฐานของ M05/M15) — ✅ เสร็จ 2026-09-20
- `src/lib/storage.ts`: presign PUT, presign GET (อายุสั้น), multipart (create/sign part/complete/abort), delete
- `POST /api/upload/presign`, `POST /api/upload/complete` — ตรวจสิทธิ์ผู้สอนก่อนออก URL ทุกครั้ง
- ตรวจ MIME จาก **magic bytes** หลังอัปโหลดเสร็จ (NFR §9 Security) ไม่เชื่อ `Content-Type` จาก client
- สร้าง bucket + lifecycle policy อัตโนมัติตอน dev ผ่าน script
- เพิ่ม env: `S3_FORCE_PATH_STYLE` (MinIO ต้องใช้ path-style, R2 ไม่ต้อง)
- **Test:** unit ของ key generator + MIME sniffing · ยังไม่มี UI

**สิ่งที่ทำจริงและผลการทดสอบกับ MinIO**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/storage.ts` | จุดเดียวที่รู้จัก endpoint/bucket — presign PUT/GET, multipart, stat, readHead, delete |
| `src/lib/object-key.ts` | สร้าง key `<kind>/<ปี>/<เดือน>/<uuid><.ext>` (แยกออกมาให้ทดสอบได้ เพราะ storage.ts เป็น server-only) |
| `src/lib/file-type.ts` | ตรวจ magic bytes 16 ไบต์แรก · รู้จัก PDF/PNG/JPEG/WEBP/MP4/WEBM/ZIP/OLE |
| `src/lib/upload-limits.ts` | เพดานขนาดและ allowlist ของ MIME ต่อ `AssetKind` |
| `src/features/uploads/` | Zod schema + ตัวช่วยตรวจสิทธิ์ของ Route Handler |
| `/api/upload/presign`, `/part`, `/complete` | เริ่ม · ขอ URL ของ part ใหม่ · ปิดงาน (complete/abort) |
| `scripts/storage-init.ts` | `pnpm storage:init` — สร้าง bucket, lifecycle, CORS |

ทดสอบกับ MinIO จริงแล้ว: ผู้เรียนขอ presign ได้ 403 · ผู้สอนอัปโหลด PDF ผ่าน single PUT สำเร็จ ·
ไฟล์ 25 MB ผ่าน multipart 3 part แบบขนานแล้ว complete สำเร็จ · ไฟล์ที่ปลอมชนิด (เนื้อเป็น PDF แจ้งว่า `video/mp4`)
ถูกปฏิเสธและลบทิ้ง · PDF 80 MB ถูกปฏิเสธตั้งแต่ขอ presign · signed URL อายุ 300 วินาทีตาม FR-15.7 ·
เรียก object ตรงโดยไม่มีลายเซ็นหรือลายเซ็นปลอมได้ 403 · ชื่อไฟล์ภาษาไทยเก็บครบถ้วน

**ข้อจำกัดของ MinIO ที่เจอระหว่างทาง (ไม่กระทบ R2)**
- MinIO ปฏิเสธ lifecycle rule ที่มีแต่ `AbortIncompleteMultipartUpload` (ต้องพ่วง `Expiration` ด้วย)
  ผมเลือก**ไม่**พ่วง เพราะนั่นเท่ากับตั้งนโยบายลบไฟล์ที่ไม่มีใครสั่ง — MinIO ล้าง stale upload ให้เองใน 24 ชม. อยู่แล้ว
- MinIO ตอบ `NotImplemented` กับ `PutBucketCors` เพราะอนุญาตทุก origin อยู่แล้ว
- **ทั้งสองข้อต้องตั้งเองบน Cloudflare R2 ตอน deploy** สคริปต์พิมพ์เตือนไว้ทุกครั้งที่รัน

### ขั้น 2 — M03 Catalog & Category — ✅ เสร็จ 2026-09-20
- FR-03.1 CRUD หมวดหมู่ (`/admin/categories`)
- FR-03.2 `/courses` — ค้นหา, กรองหมวด/คณะ/ระดับ, เรียง 3 แบบ, pagination
- FR-03.3 `/courses/[slug]` — ปก, คำอธิบาย, ผู้สอน, สารบัญ, ปุ่มลงทะเบียน
- FR-03.4 visibility: `PUBLIC` เห็นได้โดยไม่ล็อกอิน · `INTERNAL` ต้องล็อกอิน
- FR-03.5 `generateMetadata` + OpenGraph
- **จุดที่ต้องระวัง:** catalog เป็นหน้าสาธารณะที่โดนถี่ที่สุด → ใช้ `"use cache"` + `cacheTag('catalog')` แล้ว revalidate ตอน publish (NFR §9 Performance)

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/features/categories/` | CRUD หมวดหมู่ + `/admin/categories` (SUPER_ADMIN) |
| `src/features/catalog/queries.ts` | `listCourses` (ค้นหา/กรอง/เรียง/แบ่งหน้า) · `getCourseBySlug` · `catalogFilterOptions` |
| `src/features/catalog/schemas.ts` | แปลง query string ด้วย Zod แบบ `.catch()` — URL ที่ผู้ใช้แก้เองไม่ทำให้หน้าพัง |
| `src/components/shared/rich-text.tsx` | render Tiptap JSON ตาม allowlist ไม่มี `dangerouslySetInnerHTML` |
| `src/app/(public)/page.tsx` | หน้าแรกจริง (เดิม `src/app/page.tsx` ยังเป็น boilerplate และอยู่นอกกลุ่ม `(public)` ทำให้ layout สาธารณะไม่เคยถูกใช้) |
| `src/app/(public)/courses/` | คลังคอร์ส + หน้ารายละเอียด + `generateMetadata`/OpenGraph |
| `src/app/not-found.tsx` | หน้า 404 ภาษาไทย (เดิมเป็นหน้า default ภาษาอังกฤษของ Next) |

**เรื่องที่ต้องบันทึกไว้**
- การเรียงตาม "คะแนนรีวิว" ใช้ค่าเฉลี่ยของตารางลูกซึ่ง Prisma สั่ง `orderBy` ไม่ได้
  จึงดึงเฉพาะ id ของคอร์สที่ตรงเงื่อนไขมาจัดอันดับในแอปแล้วค่อยแบ่งหน้า
  เลือกวิธีนี้แทน raw SQL เพื่อไม่ให้มี where สองชุดที่หลุดกันได้ และแทนการ denormalize
  `ratingAvg` ลง `Course` ซึ่งเป็นการแก้ schema ที่ต้องขออนุมัติก่อน
- `"use cache"` **ยังไม่ได้ใช้** เพราะต้องเปิด `cacheComponents` ซึ่งเปลี่ยนพฤติกรรมทั้งแอป
  (ทุก dynamic API ต้องอยู่ใน Suspense) ควรเปิดเป็นงานแยกพร้อมตรวจทั้งระบบ ไม่ใช่แทรกกลางเฟส
- `loading.tsx` ที่ระดับ segment `courses/` ทำให้ `notFound()` ของ `/courses/[slug]` ตอบ HTTP 200
  (soft 404) เพราะ response เริ่ม stream ไปก่อน แก้โดยย้าย skeleton เข้าไปไว้ใน `<Suspense>`
  ของหน้ารายการเอง
- e2e เดิมล็อกอินซ้ำทุกเทสต์จนชน rate limit ของตัวเอง (FR-01.7 · 5 ครั้ง/15 นาที) แก้เป็น
  setup project ที่ล็อกอินครั้งเดียวแล้วแชร์ `storageState`
- **ยังค้าง:** `/privacy` มีลิงก์ใน footer แต่ยังไม่มีหน้า — เป็นเนื้อหาเชิงนโยบายที่ต้องให้เจ้าของระบบเขียน

### ขั้น 3 — M04 Course Builder ✋ *จุดตรวจที่ 1* — ✅ เสร็จ 2026-09-20
- FR-04.1 ฟอร์มข้อมูลคอร์ส (ซ่อนช่อง `price` ไว้จนเฟส 2)
- FR-04.2 จัดการ Section/Lesson + **ลากเรียงลำดับ** (dnd-kit) → บันทึก `position` เป็นชุดใน transaction เดียว
- FR-04.3 ฟอร์มแยกตามประเภทบทเรียนทั้ง 6
- FR-04.4 ติ๊กบทเรียน preview
- FR-04.5 เพิ่ม/ลบผู้สอนร่วม (`CourseInstructor`)
- FR-04.6 workflow `DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED` + หน้าอนุมัติของ Dept Admin
- FR-04.7 ฟอร์มเงื่อนไขจบคอร์ส (เก็บลง `completionRule` JSON)
- **ต้องเพิ่มใน DAL:** `assertCourseAccess(userId, courseId, "teach" | "manage")` ตามที่ system-design §4.2 ระบุไว้แต่ยังไม่ได้เขียน

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/rbac.ts` | เพิ่ม `assertCourseAccess(courseId, "learn"\|"teach"\|"manage")` และ `requireCourseCreator()` |
| `src/features/courses/schemas.ts` | Zod ของคอร์ส/บท/บทเรียน · allowlist โดเมนวิดีโอ · เงื่อนไขการจบ |
| `src/features/courses/queries.ts` | รายการคอร์สของผู้สอน · ข้อมูลฟอร์ม · สารบัญ · คิวรออนุมัติ |
| `src/features/courses/actions.ts` | CRUD คอร์ส/บท/บทเรียน · จัดลำดับ · ผู้สอนร่วม · workflow สถานะ |
| `src/features/courses/components/sortable-row.tsx` | รายการลากเรียงลำดับ รองรับคีย์บอร์ดด้วย |
| `/teach`, `/teach/courses/new`, `/teach/courses/[id]`, `/teach/courses/[id]/curriculum` | หน้าฝั่งผู้สอน |
| `/admin/courses` | คิวคอร์สรออนุมัติของผู้ดูแลคณะ |

**เรื่องที่ต้องบันทึกไว้**
- **บั๊กที่เจอจาก e2e:** ช่องที่ไม่ปรากฏในฟอร์ม (เช่น ผู้สอนธรรมดาไม่เห็นช่องเลือกคณะ)
  ทำให้ `formData.get()` คืน `null` ซึ่ง `z.string().optional()` ปฏิเสธ — สร้างคอร์สไม่ได้เลย
  แก้เป็น `.nullish()` ทุกช่องที่อาจไม่ปรากฏ และเพิ่มการแสดง error ใต้ช่องแบบ Select
  (เดิมมีแต่ toast รวม ทำให้ผู้ใช้ไม่รู้ว่าช่องไหนผิด)
- การจัดลำดับเขียนทั้งชุดใน transaction เดียว และตรวจก่อนว่าทุก id เป็นของคอร์ส/บทนั้นจริง
- ปุ่มจับสำหรับลากใช้คีย์บอร์ดได้ (Tab → Space → ลูกศร) ตาม DoD ข้อ A11y
- กันเผยแพร่คอร์สที่ยังไม่มีบทเรียน และกันถอดผู้สอนจนคอร์สไม่เหลือผู้สอนเลย
- **ยังไม่ทำในขั้นนี้ (อยู่ในขั้น 4):** อัปโหลดภาพปก, Tiptap editor สำหรับคำอธิบายคอร์สและบทเรียน TEXT,
  แนบไฟล์ PDF — ฟอร์มบทเรียนจะบอกผู้ใช้ไว้ตรง ๆ ว่าชนิดไหนยังบันทึกได้แค่ชื่อกับตำแหน่ง
- e2e เพิ่ม setup ล็อกอิน 3 บทบาท และให้เทสต์ล็อกอินจริงรันเฉพาะ desktop
  เพื่อคุมยอดล็อกอินต่อรอบไม่ให้ชนลิมิต 5 ครั้ง/15 นาที

### ขั้น 4 — M05 Content Delivery (ฝั่งผู้สอน) — ✅ เสร็จ 2026-09-21
- FR-05.1 อัปโหลดวิดีโอ multipart พร้อมแถบความคืบหน้า, ยกเลิกได้, กู้คืนเมื่อ part ล้ม
- FR-05.4 Tiptap editor (หัวข้อ, รูป, ตาราง, โค้ด, ลิงก์, วิดีโอฝัง) → เก็บเป็น JSON
- FR-05.5 ฟอร์มบทเรียน Live
- FR-05.7 ไฟล์ประกอบ + ธง `downloadable`
- **จุดที่ต้องระวัง:** render Tiptap JSON เป็น HTML ต้องผ่าน allowlist ฝั่ง server เท่านั้น (NFR §9) ห้าม `dangerouslySetInnerHTML` กับ JSON ดิบ

**สิ่งที่ทำจริง**

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/rich-text-doc.ts` | ประกอบเอกสาร Tiptap ขึ้นใหม่จาก allowlist ฝั่ง server ก่อนเขียนลง DB · มีเพดานความลึก/จำนวน node |
| `src/components/editor/rich-text-editor.tsx` | Tiptap: หัวข้อ, รายการ, quote, โค้ด, เส้นคั่น, ลิงก์, รูป, ตาราง, ฝัง YouTube |
| `src/components/editor/rich-text-field.tsx` | โหลด editor แบบ dynamic `ssr:false` — หน้าที่ไม่ได้ใช้ไม่ต้องแบก ProseMirror |
| `src/features/uploads/lib/upload-client.ts` | อัปโหลดจากเบราว์เซอร์: single/multipart ขนาน 3 part · ความคืบหน้า · ยกเลิก · ขอ URL ของ part ใหม่เมื่อล้ม |
| `src/features/uploads/components/asset-field.tsx` | ช่องแนบไฟล์ที่ใช้ร่วมกันทั้งปก/วิดีโอ/PDF/ไฟล์ประกอบ |
| `src/app/api/media/[assetId]/route.ts` | เสิร์ฟ **เฉพาะรูปภาพ** ผ่าน URL คงที่ (ปกคอร์ส + รูปในบทความ) |
| `src/features/courses/components/attachment-manager.tsx` | FR-05.7 เพิ่ม/ลบไฟล์ประกอบ และสวิตช์สิทธิ์ดาวน์โหลดรายไฟล์ |
| `src/lib/form.ts` | ส่งฟอร์มแบบไม่ให้ React ล้างค่าที่กรอกไว้เมื่อบันทึกไม่ผ่าน |
| `tests/e2e/content.spec.ts` | เส้นทางจริง: อัปโหลดปก → เขียนคำอธิบาย → บทเรียน PDF → ไฟล์ประกอบ |
| `prisma/seed.ts` | บทเรียนครบ 6 ชนิด + อัปโหลดไฟล์ PDF/ไฟล์ประกอบจริงเข้า storage |

**เรื่องที่ต้องบันทึกไว้**
- **ภาพปกเปลี่ยนไปใช้ `/api/media/<assetId>` แทน signed URL** — ของเดิมพังอยู่แล้วเพราะ `next/image`
  ไม่ได้ตั้ง `remotePatterns` ของโดเมน storage และลายเซ็นที่เปลี่ยนทุกครั้งที่ render ทำให้แคชไม่ได้เลย
  route นี้รับเฉพาะ `AssetKind.IMAGE` · วิดีโอ/PDF/ไฟล์ประกอบยังต้องรอเส้นทางที่ตรวจ enrollment ในขั้น 6 (FR-15.7)
- **ETag ของ part**: MinIO เปิด `ETag` ข้ามโดเมนให้ จึงอ่านจาก XHR ได้ตรง ๆ แต่ R2 อาจไม่เปิด
  `/api/upload/complete` จึงถาม storage เองด้วย `ListParts` เมื่อ client ไม่ได้ส่ง ETag มา (ทดสอบทั้งสองทางแล้ว)
- รูปในบทความอ้างถึงด้วย `/api/media/<assetId>` เท่านั้น ตัวตรวจฝั่ง server ทิ้ง node รูปที่ชี้ออกนอกระบบ
  และทิ้ง iframe ที่ไม่ใช่โดเมนใน allowlist — ไม่รับ `data:` URL จึงไม่มีรูปฝังที่เลี่ยงการตรวจชนิดไฟล์
- บั๊กที่เจอระหว่างทดสอบกับของจริง: `/api/upload/complete` ตอบฟิลด์ `id` แต่ฝั่ง client อ่าน `assetId`
  ทำให้รูปชี้ไป `/api/media/undefined` · กล่องไฟล์ประกอบอ่านข้อมูลจาก snapshot ตอนเปิดกล่อง
  ไฟล์ที่เพิ่งแนบจึงไม่ขึ้นจนกว่าจะปิดแล้วเปิดใหม่ — แก้ให้อ่านจาก state ชุดล่าสุดแทน
- แก้ hydration mismatch ที่ค้างมาจากขั้น 3: dnd-kit ตั้ง id ของข้อความประกาศจากตัวนับที่ server กับ client
  นับไม่ตรงกัน ทำให้ `aria-describedby` ของปุ่มจับชี้ไปยัง id ที่ไม่มีจริง — ตั้ง `id` ให้ `DndContext` เอง
- **`<form action={fn}>` ของ React 19 สั่ง reset ฟอร์มให้เองเมื่อ action จบ** ทุกฟอร์มในระบบจึงล้างค่าที่พิมพ์ไว้
  ทิ้งทุกครั้งที่บันทึกไม่ผ่าน (เจ็บที่สุดกับฟอร์มบทเรียนที่มีบทความยาว) — เพิ่ม `src/lib/form.ts` แล้วเปลี่ยน
  ฟอร์มที่มีการกรอกข้อมูลทั้งหมดมาใช้ `onSubmit={submitForm(...)}` ค่าที่กรอกจึงอยู่ครบพร้อมข้อความว่าผิดตรงไหน
  (ฟอร์มที่มีแต่ปุ่มยืนยัน เช่น ลบหรือเปลี่ยนสถานะ ยังใช้ `action` ตามเดิม)
- ช่องเลือก "ชนิดบทเรียน" ไม่เคยแสดง error ของตัวเอง ถ้า validation ตกที่ฟิลด์นี้ผู้ใช้จะเห็นแต่ toast รวม ๆ — เพิ่มแล้ว
- ติ๊ก "ให้ดาวน์โหลดได้" ใช้ `useOptimistic` ให้ช่องขยับทันที ไม่ต้องรอ server ตอบ แล้วคืนค่าเองถ้าบันทึกไม่ผ่าน
- **ไฟล์ที่ถูกแทนที่ยังค้างอยู่ใน storage** — เปลี่ยนปกหรือเปลี่ยนไฟล์วิดีโอแล้วของเดิมไม่ถูกลบ
  ตั้งใจไม่ลบอัตโนมัติในขั้นนี้ เพราะต้องรู้ก่อนว่าไม่มีที่อื่นอ้างถึง (เช่น บทเรียนอื่นใช้ Asset เดียวกัน)
  ควรทำเป็นงานเก็บกวาดแยกพร้อมเงื่อนไขที่ชัดเจน ไม่ใช่ลบทิ้งกลางทางของฟอร์ม
- **ยังไม่ทำในขั้นนี้ (อยู่ในขั้น 6):** ตัวเล่นวิดีโอ, pdf.js, หน้าเรียนของผู้เรียน และการออก signed URL
  ของเนื้อหาหลังตรวจ enrollment — ตอนนี้ไฟล์ที่อัปโหลดแล้วยังไม่มีหน้าไหนเปิดดูได้นอกจากฟอร์มของผู้สอน

### ขั้น 5 — M06 Enrollment & Progress
- FR-06.1 นโยบาย `OPEN` / `APPROVAL` / `INVITE_ONLY` + หน้าคำขออนุมัติ
- FR-06.2 ลงทะเบียนกลุ่ม (เลือกผู้ใช้ / CSV — ใช้ `features/users/lib/csv.ts` เดิมได้) + วันหมดสิทธิ์
- FR-06.3 บันทึกความคืบหน้า: ดูวิดีโอเกิน 90% หรือกด "เรียนจบบทนี้" → คำนวณ `progressPct` ใน transaction
- FR-06.4 "เรียนต่อ" จาก `lastLessonId` + `lastPositionSec`
- FR-06.5 บังคับเรียนตามลำดับ (ตรวจฝั่ง server ไม่ใช่แค่ซ่อนปุ่ม)
- FR-06.6 `/my-courses` แยก กำลังเรียน / เรียนจบ / หมดอายุ
- **Test:** unit ของสูตรคำนวณ % และกติกา sequential เป็นหัวใจ — เขียนก่อน UI

### ขั้น 6 — M15 Content Protection + M05 ฝั่งผู้เรียน ✋ *จุดตรวจที่ 2*
- `<ProtectedViewer>` ตาม system-design §6.2 ครอบ `<VideoPlayer>` / `<PdfCanvasViewer>` / `<RichTextRenderer>`
- FR-15.1–15.4 บล็อกคลิกขวา/เลือก/คัดลอก/ลาก, ดักคีย์, เบลอเมื่อเสียโฟกัส, `@media print`
- FR-15.5 dynamic watermark + `MutationObserver` สร้างกลับเมื่อถูกลบ
- FR-15.6 DevTools heuristic
- FR-15.7 signed URL ≤ 5 นาที ออกให้หลังตรวจ enrollment แล้วเท่านั้น
- FR-15.8 `POST /api/events/screen` — รวม event debounce 5 วิ ส่งด้วย `sendBeacon` + rate limit
- FR-15.9 สวิตช์เปิด/ปิดระดับระบบ (`SystemSetting`) และระดับคอร์ส (`Course.protectionEnabled`)
- FR-05.2, 05.3, 05.6 — player, pdf.js canvas, หน้าเรียนพร้อมสารบัญ (drawer บนมือถือ)
- **ต้องแก้ CSP ใน `next.config.ts`:** ตอนนี้ยังไม่มี CSP เลย ต้องเพิ่มให้อนุญาต frame เฉพาะ youtube/vimeo และ media จากโดเมน storage

### ขั้น 7 — M11 in-app + ปิดเฟส
- FR-11.1 ประกาศ 3 ระดับ + ปักหมุด
- FR-11.2 กระดิ่ง + จำนวนยังไม่อ่าน + หน้ารวม + ทำเครื่องหมายอ่านแล้ว
- `src/lib/notify/index.ts` เป็นจุดเดียวที่ยิง notification (เตรียมรับ email/LINE ในเฟส 3)
- **ยังไม่ทำในเฟสนี้:** FR-11.3 (email) และ FR-11.4 (ตั้งค่าช่องทาง) — อยู่ Phase 3 ตาม roadmap
- e2e ปิดเฟส: สร้างคอร์ส → อนุมัติ → ลงทะเบียน → เรียน → ความคืบหน้าขึ้น → watermark ปรากฏ

---

## 3. สิ่งที่ต้องเพิ่มนอกเหนือจากโค้ดฟีเจอร์

| รายการ | เหตุผล | ขั้นที่ |
|---|---|---|
| `assertCourseAccess()` ใน `lib/rbac.ts` | system-design §4.2 ระบุไว้แล้วแต่ Phase 0 ยังไม่ได้เขียน | 3 |
| CSP header ใน `next.config.ts` | NFR §9 กำหนดไว้ แต่ Phase 0 ใส่แค่ 6 header อื่น | 6 |
| `src/lib/storage.ts` + `S3_FORCE_PATH_STYLE` | MinIO ต้องใช้ path-style ส่วน R2 ไม่ต้อง | 1 ✅ |
| `pnpm db:seed` เพิ่มบทเรียนครบ 6 ประเภท | ให้ทดสอบ player ได้ทุกชนิดโดยไม่ต้องสร้างมือ | 4 ✅ |
| dnd-kit ✅, Tiptap ✅, pdf.js | dependency ใหม่ 3 ตัว | 3, 4, 6 |

---

## 4. ความเสี่ยงที่มองเห็นตอนนี้

| ความเสี่ยง | ผลกระทบ | แนวทาง |
|---|---|---|
| Watermark บน fullscreen ของวิดีโอ | ถ้าใช้ fullscreen ของ `<video>` watermark จะหาย = ตามรอยไม่ได้ | สั่ง fullscreen ที่ container ตาม §6.2 และเขียน e2e ยืนยัน |
| pdf.js worker กับ Turbopack | ตั้งค่า worker ผิดจะ render ไม่ขึ้นเฉพาะ production build | ทดสอบบน `next build` ไม่ใช่แค่ `next dev` |
| Multipart upload ล้มกลางคัน | เหลือ part ค้างใน bucket กินพื้นที่ | `abort` เมื่อยกเลิก + lifecycle rule ล้าง multipart ค้างเกิน 24 ชม. |
| M15 กระทบ a11y | ปิดการเลือกข้อความ/คีย์ลัดอาจชนกับ screen reader และ DoD ข้อ A11y | จำกัดขอบเขตไว้เฉพาะพื้นที่เนื้อหา ไม่ครอบทั้งหน้า และทดสอบ keyboard navigation |
| ขนาดงานรวม | 6 โมดูล P0 ในเฟสเดียว | หยุดให้ตรวจ 2 จุด (หลังขั้น 3 และขั้น 6) เพื่อไม่ให้หลุดทิศไปไกล |

---

## 5. ข้อที่ต้องการคำยืนยันก่อนเริ่มขั้น 1

1. **เพดานขนาดไฟล์** — วิดีโอ 2 GB / PDF 50 MB / ไฟล์แนบ 25 MB ใช้ได้ไหม
2. **ลำดับงาน** — ตามขั้น 1–7 ข้างบน หรืออยากให้ดัน M15 (ป้องกันเนื้อหา) ขึ้นมาก่อน M06
3. **จุดหยุดตรวจ** — 2 จุดพอไหม หรืออยากตรวจทุกขั้น
