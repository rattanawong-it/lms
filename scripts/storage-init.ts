import "dotenv/config";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * เตรียม bucket สำหรับเครื่องพัฒนา (D-01 — MinIO)
 * รันด้วย `pnpm storage:init` หลัง `pnpm db:up`
 *
 * บน Cloudflare R2 ตอน deploy ให้ตั้งค่าเดียวกันนี้จากหน้า dashboard แทน
 */
const BUCKET = process.env.S3_BUCKET ?? "lms";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`  bucket "${BUCKET}" มีอยู่แล้ว`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`  สร้าง bucket "${BUCKET}" แล้ว`);
  }
}

/**
 * เก็บกวาด multipart ที่ค้าง — กันพื้นที่รั่วเมื่อผู้ใช้ปิดเบราว์เซอร์กลางคัน
 *
 * MinIO ปฏิเสธ rule ที่มีแต่ `AbortIncompleteMultipartUpload` (ต้องมี `Expiration` ควบ)
 * แต่ MinIO ล้าง stale upload ให้เองอยู่แล้ว (ค่าตั้งต้น 24 ชม.) จึงข้ามไปได้
 * ไม่ตั้งนโยบายลบไฟล์เพิ่มเพื่อให้ผ่าน เพราะนั่นจะเป็นการลบข้อมูลที่ไม่มีใครสั่ง
 */
async function ensureLifecycle() {
  try {
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: BUCKET,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "abort-incomplete-multipart",
              Status: "Enabled",
              Filter: {},
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
            },
          ],
        },
      }),
    );
    console.log("  ตั้ง lifecycle: ล้าง multipart ที่ค้างเกิน 1 วัน");
  } catch {
    console.log(
      "  ข้าม lifecycle — ผู้ให้บริการไม่รับ rule นี้ (MinIO ล้าง stale upload ให้เองใน 24 ชม.)",
    );
    console.log(
      "  หมายเหตุ: บน Cloudflare R2 / S3 ให้ตั้ง rule นี้เองจาก dashboard ตอน deploy",
    );
  }
}

/**
 * เบราว์เซอร์อัปโหลดตรงไปยัง storage จึงต้องเปิด CORS ให้โดเมนของแอป
 * MinIO ไม่รองรับ PutBucketCors (ตอบ NotImplemented) เพราะอนุญาตทุก origin อยู่แล้ว
 */
async function ensureCors() {
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [APP_URL],
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    console.log(`  ตั้ง CORS ให้ origin ${APP_URL} (expose ETag สำหรับ multipart)`);
  } catch {
    console.log("  ข้าม CORS — MinIO อนุญาตทุก origin อยู่แล้ว");
    console.log(
      `  หมายเหตุ: บน Cloudflare R2 ต้องตั้ง CORS เอง (origin ${APP_URL}, method GET/PUT/HEAD, expose ETag)`,
    );
  }
}

async function main() {
  console.log(`เตรียม storage ที่ ${process.env.S3_ENDPOINT}`);
  await ensureBucket();
  await ensureLifecycle();
  await ensureCors();
  console.log("เสร็จแล้ว");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
