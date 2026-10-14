import { config } from "dotenv";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * ตรวจว่า storage (MinIO / Cloudflare R2) พร้อมใช้กับแอปหรือไม่ — ไม่แก้การตั้งค่าใด ๆ
 * เขียน object ทดสอบใต้ `_healthcheck/` แล้วลบทิ้งเมื่อจบ
 *
 *   pnpm storage:check                         ใช้ค่าใน .env
 *   pnpm storage:check .env.r2                 ใช้ค่าในไฟล์อื่น (เช่นค่าของ R2 ที่ตั้งบน Vercel)
 *   pnpm storage:check .env.r2 https://lms.example.ac.th   ตรวจ CORS กับ origin นี้แทน NEXT_PUBLIC_APP_URL
 */
const envFile = process.argv[2] ?? ".env";
config({ path: envFile, override: true, quiet: true });

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`✗ ${envFile} ขาด ${missing.join(", ")}`);
  process.exit(1);
}

const BUCKET = process.env.S3_BUCKET!;
const ENDPOINT = process.env.S3_ENDPOINT!;
const PATH_STYLE = process.env.S3_FORCE_PATH_STYLE !== "false";
const ORIGIN = new URL(process.argv[3] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  .origin;

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: ENDPOINT,
  forcePathStyle: PATH_STYLE,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

let failed = 0;
function pass(message: string) {
  console.log(`  ✓ ${message}`);
}
function fail(message: string) {
  failed += 1;
  console.log(`  ✗ ${message}`);
}
function warn(message: string) {
  console.log(`  ! ${message}`);
}
function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const runId = Date.now().toString(36);
const smallKey = `_healthcheck/${runId}.txt`;
const multipartKey = `_healthcheck/${runId}-multipart.bin`;
const BODY = `krirk-lms storage check ${runId}`;

async function main() {
  console.log(`ตรวจ storage จาก ${envFile}`);
  console.log(`  endpoint ${new URL(ENDPOINT).origin} · bucket ${BUCKET} · path-style ${PATH_STYLE}`);
  console.log(`  origin ของแอป ${ORIGIN}\n`);

  // 1) เข้าถึง bucket ได้
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    pass("เข้าถึง bucket ได้ (key ถูกต้อง)");
  } catch (error) {
    fail(`เข้าถึง bucket ไม่ได้ — ${errorText(error)}`);
    return;
  }

  // 2) server เขียน/อ่านเอง (ใบประกาศ · ตรวจ magic bytes)
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: smallKey, Body: BODY, ContentType: "text/plain" }),
    );
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: smallKey }));
    const text = await got.Body?.transformToString();
    if (text === BODY) pass("server เขียนและอ่าน object ได้");
    else fail("อ่าน object กลับมาแล้วเนื้อหาไม่ตรง");
  } catch (error) {
    fail(`server เขียน/อ่านไม่ได้ — ${errorText(error)}`);
    return;
  }

  // 3) signed GET + Range (วิดีโอเล่นตรงจาก storage · PDF ขอเป็นช่วง)
  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: smallKey }), {
    expiresIn: 300,
  });
  const getOrigin = new URL(getUrl).origin;
  try {
    const response = await fetch(getUrl, { headers: { Range: "bytes=0-5" } });
    const text = await response.text();
    if (response.status === 206 && text === BODY.slice(0, 6)) pass("signed GET + Range ได้ 206");
    else fail(`signed GET ได้สถานะ ${response.status}`);
  } catch (error) {
    fail(`signed GET ไม่สำเร็จ — ${errorText(error)}`);
  }

  // signed URL ต้องอยู่โดเมนเดียวกับที่ CSP อนุญาต (proxy.ts ใช้ origin ของ S3_ENDPOINT)
  if (getOrigin === new URL(ENDPOINT).origin) pass(`โดเมนของ signed URL ตรงกับ CSP (${getOrigin})`);
  else
    fail(
      `signed URL อยู่ที่ ${getOrigin} แต่ CSP อนุญาต ${new URL(ENDPOINT).origin} — ตั้ง S3_FORCE_PATH_STYLE=true`,
    );

  // 4) CORS — เบราว์เซอร์อัปโหลดตรงด้วย PUT
  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: smallKey, ContentType: "text/plain" }),
    { expiresIn: 300 },
  );
  try {
    const preflight = await fetch(putUrl, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const allowOrigin = preflight.headers.get("access-control-allow-origin");
    if (allowOrigin === ORIGIN || allowOrigin === "*") pass(`CORS preflight อนุญาต ${ORIGIN}`);
    else fail(`CORS preflight ไม่อนุญาต ${ORIGIN} (สถานะ ${preflight.status}) — ตรวจ CORS policy ของ bucket`);

    const put = await fetch(putUrl, {
      method: "PUT",
      headers: { Origin: ORIGIN, "Content-Type": "text/plain" },
      body: BODY,
    });
    const expose = (put.headers.get("access-control-expose-headers") ?? "").toLowerCase();
    if (!put.ok) fail(`PUT ด้วย signed URL ได้สถานะ ${put.status}`);
    else if (expose.includes("etag") || expose === "*") pass("PUT ด้วย signed URL ได้ และเปิด ETag ให้เบราว์เซอร์");
    else if (put.headers.get("access-control-allow-origin"))
      warn("PUT ได้ แต่ไม่ expose ETag — อัปโหลดไฟล์ใหญ่ยังทำได้ (server ถาม listParts เอง) แต่ช้ากว่า");
    else warn("PUT ได้ แต่ไม่ได้ตอบ header CORS กลับมา (MinIO ในเครื่องเป็นแบบนี้ได้)");
  } catch (error) {
    fail(`ตรวจ CORS ไม่สำเร็จ — ${errorText(error)}`);
  }

  // 5) multipart (วิดีโอ > 20 MB) — part เดียวเป็น part สุดท้ายจึงเล็กกว่า 5 MB ได้
  let uploadId: string | undefined;
  try {
    const created = await s3.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: multipartKey, ContentType: "application/octet-stream" }),
    );
    uploadId = created.UploadId;
    const part = await s3.send(
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: multipartKey,
        UploadId: uploadId,
        PartNumber: 1,
        Body: new Uint8Array(1024),
      }),
    );
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: multipartKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
      }),
    );
    uploadId = undefined;
    pass("multipart upload ได้");
  } catch (error) {
    fail(`multipart ไม่สำเร็จ — ${errorText(error)}`);
    if (uploadId) {
      await s3
        .send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: multipartKey, UploadId: uploadId }))
        .catch(() => {});
    }
  }

  // 6) lifecycle — token แบบ Object Read & Write อ่านค่านี้ไม่ได้ ไม่นับเป็นข้อผิดพลาด
  try {
    const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET }));
    const abortRule = lifecycle.Rules?.find((rule) => rule.AbortIncompleteMultipartUpload);
    if (abortRule)
      pass(
        `lifecycle ล้าง multipart ค้างหลัง ${abortRule.AbortIncompleteMultipartUpload?.DaysAfterInitiation} วัน`,
      );
    else warn("ไม่พบ rule ล้าง multipart ที่ค้าง");
  } catch {
    warn("อ่าน lifecycle ไม่ได้ (สิทธิ์ของ token ไม่ถึงหรือผู้ให้บริการไม่รองรับ) — ตรวจจาก dashboard แทน");
  }

  // 7) ลบทิ้ง (เส้นทางเปลี่ยนไฟล์/ลบไฟล์ของแอป)
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: smallKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: multipartKey }));
    pass("ลบ object ได้ (ล้างไฟล์ทดสอบแล้ว)");
  } catch (error) {
    fail(`ลบ object ไม่ได้ — ${errorText(error)} · ไฟล์ทดสอบค้างใต้ _healthcheck/`);
  }
}

main()
  .catch((error) => {
    fail(errorText(error));
  })
  .finally(() => {
    console.log(failed === 0 ? "\nพร้อมใช้งาน" : `\nไม่ผ่าน ${failed} ข้อ`);
    process.exitCode = failed === 0 ? 0 : 1;
  });
