import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { MAGIC_HEAD_BYTES } from "@/lib/file-type";

/**
 * D-01 — จุดเดียวในระบบที่รู้จัก endpoint และ bucket ของ storage
 * ที่อื่นต้องเรียกผ่านฟังก์ชันในไฟล์นี้เท่านั้น การย้ายจาก MinIO ไป Cloudflare R2
 * จึงทำได้ด้วยการเปลี่ยน `S3_*` ใน env โดยไม่ต้องแก้โค้ดฟีเจอร์
 */
const globalForS3 = globalThis as unknown as { s3: S3Client | undefined };

function createClient(): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    // MinIO ใช้ http://host/bucket/key ส่วน R2 ใช้ virtual-host
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

export const s3 = globalForS3.s3 ?? createClient();
if (process.env.NODE_ENV !== "production") globalForS3.s3 = s3;

const BUCKET = env.S3_BUCKET;

/** อายุ signed URL สำหรับ "อ่าน" — FR-15.7 กำหนดไม่เกิน 5 นาที */
export const READ_URL_TTL_SECONDS = 5 * 60;

/** อายุ signed URL สำหรับ "เขียน" — ยาวกว่าเพราะไฟล์ใหญ่ใช้เวลาอัปโหลด */
const WRITE_URL_TTL_SECONDS = 60 * 60;

export { buildObjectKey } from "@/lib/object-key";

// ───────────── อัปโหลดไฟล์เล็ก (ทีเดียวจบ) ─────────────

export async function presignPut(key: string, mime: string): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mime }), {
    expiresIn: WRITE_URL_TTL_SECONDS,
  });
}

// ───────────── อัปโหลดไฟล์ใหญ่ (multipart · system-design §5.8) ─────────────

export async function createMultipart(key: string, mime: string): Promise<string> {
  const result = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: mime }),
  );
  if (!result.UploadId) throw new Error("storage: ไม่ได้รับ UploadId จาก storage");
  return result.UploadId;
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  return getSignedUrl(
    s3,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: WRITE_URL_TTL_SECONDS },
  );
}

export type UploadedPart = { partNumber: number; etag: string };

/**
 * ถาม storage เองว่ามี part ใดอัปโหลดสำเร็จแล้วบ้าง
 *
 * ใช้เมื่อเบราว์เซอร์อ่าน header `ETag` ของการอัปโหลดข้ามโดเมนไม่ได้
 * (ขึ้นกับ `Access-Control-Expose-Headers` ของ storage ซึ่งคุมจากฝั่งแอปไม่ได้)
 * ค่าที่ได้จาก storage เชื่อถือได้กว่าค่าที่ client แจ้งมาอยู่แล้ว
 */
export async function listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
  const parts: UploadedPart[] = [];
  let marker: number | undefined;

  do {
    const result = await s3.send(
      new ListPartsCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker != null ? String(marker) : undefined,
      }),
    );
    for (const part of result.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({ partNumber: part.PartNumber, etag: part.ETag });
      }
    }
    marker = result.IsTruncated ? Number(result.NextPartNumberMarker) : undefined;
  } while (marker);

  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: UploadedPart[],
): Promise<void> {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

/** ยกเลิกแล้วต้อง abort เสมอ ไม่งั้น part ที่อัปไปแล้วจะค้างกินพื้นที่ใน bucket */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await s3.send(
    new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }),
  );
}

// ───────────── อ่าน ─────────────

/**
 * signed URL อายุสั้นสำหรับดูเนื้อหา (FR-15.7)
 * `downloadName` ใส่เฉพาะไฟล์ที่ผู้สอนอนุญาตให้ดาวน์โหลดจริง (FR-05.7) เท่านั้น
 */
export async function presignGet(
  key: string,
  options: { expiresIn?: number; downloadName?: string } = {},
): Promise<string> {
  const { expiresIn = READ_URL_TTL_SECONDS, downloadName } = options;
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        : "inline",
    }),
    { expiresIn },
  );
}

/**
 * อ่าน object ออกมาเป็น stream เพื่อส่งต่อให้เบราว์เซอร์ (ใช้กับรูปภาพใน `/api/media`)
 * ไฟล์ไม่ถูกโหลดเข้าหน่วยความจำทั้งก้อน และ object key ไม่หลุดออกไปถึง client
 */
export type ObjectStream = {
  body: ReadableStream<Uint8Array>;
  mime: string;
  size: number | null;
  etag: string | null;
};

export async function getObjectStream(key: string): Promise<ObjectStream | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = result.Body?.transformToWebStream();
    if (!body) return null;
    return {
      body: body as ReadableStream<Uint8Array>,
      mime: result.ContentType ?? "application/octet-stream",
      size: result.ContentLength ?? null,
      etag: result.ETag ?? null,
    };
  } catch {
    return null;
  }
}

export type ObjectStat = { size: number; mime: string | null };

export async function statObject(key: string): Promise<ObjectStat | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { size: Number(head.ContentLength ?? 0), mime: head.ContentType ?? null };
  } catch {
    return null;
  }
}

/** อ่านไบต์แรกของ object ไว้ตรวจ magic bytes — ดึงเฉพาะช่วงที่ต้องใช้ ไม่โหลดทั้งไฟล์ */
export async function readHead(key: string): Promise<Uint8Array | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: `bytes=0-${MAGIC_HEAD_BYTES - 1}`,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
