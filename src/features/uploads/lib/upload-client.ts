import { MULTIPART_PART_SIZE, checkUpload, formatBytes } from "@/lib/upload-limits";
import type { AssetKind } from "@/generated/prisma/enums";

/**
 * FR-05.1 — อัปโหลดไฟล์จากเบราว์เซอร์ตรงไปยัง storage
 *
 * ไฟล์ไม่ผ่าน app server เลย แอปเป็นแค่คนออกลายเซ็นและปิดงาน (system-design §5.8)
 * ใช้ XMLHttpRequest แทน fetch เพราะ fetch ยังรายงานความคืบหน้าของ "ขาส่ง" ไม่ได้
 */

export type UploadedAsset = {
  assetId: string;
  originalName: string;
  mime: string;
  size: number;
  sizeLabel: string;
};

export type UploadOptions = {
  /** 0–100 — เรียกถี่ ผู้เรียกควรอัปเดต state ตรง ๆ ได้เลย */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** M08 — ไฟล์ส่งงานของงานนี้ (server ตรวจสิทธิ์ตามงาน ไม่ใช่ตามบทบาท) */
  assignmentId?: string;
  /** ใช้แทน `file.type` ที่เบราว์เซอร์เดา — ไฟล์ส่งงานตัดสิน MIME จากนามสกุลที่ผู้สอนอนุญาต */
  mime?: string;
};

/** ข้อผิดพลาดที่มีข้อความภาษาไทยพร้อมแสดงต่อผู้ใช้ */
export class UploadError extends Error {}

/** ผู้ใช้กดยกเลิกเอง — ผู้เรียกไม่ต้องขึ้น toast แดง */
export class UploadCancelled extends Error {
  constructor() {
    super("ยกเลิกการอัปโหลดแล้ว");
  }
}

/** รูปแบบที่ `/api/upload/complete` ตอบกลับ — ใช้ `id` ตามชื่อคอลัมน์ของ Asset */
type CompleteResponse = {
  asset: { id: string; originalName: string; mime: string; size: number; sizeLabel: string };
};

function toUploadedAsset(response: CompleteResponse): UploadedAsset {
  const { id, ...rest } = response.asset;
  return { assetId: id, ...rest };
}

type PresignResponse =
  | { ok: true; mode: "single"; assetId: string; url: string }
  | {
      ok: true;
      mode: "multipart";
      assetId: string;
      uploadId: string;
      partSize: number;
      parts: { partNumber: number; url: string }[];
    };

/** จำนวน part ที่ส่งขนานกัน — มากกว่านี้ไม่ได้เร็วขึ้นแต่แย่งแบนด์วิดท์กันเอง (§5.8) */
const PART_CONCURRENCY = 3;

/** จำนวนครั้งที่ลองใหม่ต่อ part ก่อนยอมแพ้ — ขอ URL ใหม่ทุกครั้งเผื่อของเดิมหมดอายุ */
const PART_RETRIES = 2;

/** แบ่งไฟล์เป็นช่วงไบต์ตามลำดับ part — แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้ทดสอบได้ */
export function planParts(size: number, partSize: number = MULTIPART_PART_SIZE) {
  const count = Math.max(1, Math.ceil(size / partSize));
  return Array.from({ length: count }, (_, index) => ({
    partNumber: index + 1,
    start: index * partSize,
    end: Math.min(size, (index + 1) * partSize),
  }));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new UploadError(data?.message ?? "ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ");
  }
  return data as T;
}

/** ส่งข้อมูลหนึ่งก้อนด้วย PUT พร้อมรายงานความคืบหน้าและยกเลิกได้ */
function putWithProgress(
  url: string,
  body: Blob,
  options: { contentType?: string; signal?: AbortSignal; onLoaded?: (bytes: number) => void },
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (options.contentType) xhr.setRequestHeader("Content-Type", options.contentType);

    const abort = () => xhr.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => options.signal?.removeEventListener("abort", abort);

    xhr.upload.onprogress = (event) => options.onLoaded?.(event.loaded);

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        // header นี้อ่านได้ก็ต่อเมื่อ storage ยอมเปิดผ่าน CORS
        // อ่านไม่ได้ก็ไม่เป็นไร ฝั่ง server จะไปถาม storage เองตอนปิดงาน
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new UploadError(`ส่งไฟล์ไปยังที่เก็บไม่สำเร็จ (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadError("เครือข่ายขัดข้องระหว่างส่งไฟล์"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new UploadCancelled());
    };

    xhr.send(body);
  });
}

/**
 * อัปโหลดไฟล์แล้วคืนข้อมูล Asset ที่พร้อมใช้งาน
 * โยน `UploadCancelled` เมื่อผู้ใช้ยกเลิก และ `UploadError` เมื่อมีอย่างอื่นผิดพลาด
 */
export async function uploadFile(
  file: File,
  kind: AssetKind,
  options: UploadOptions = {},
): Promise<UploadedAsset> {
  const { onProgress, signal, assignmentId } = options;
  const mime = options.mime ?? file.type;

  // ตรวจด้วยกติกาชุดเดียวกับฝั่ง server ก่อน เพื่อบอกผู้ใช้ทันทีโดยไม่ต้องรอไป-กลับ
  const check = checkUpload(kind, mime, file.size);
  if (!check.ok) throw new UploadError(check.message);
  if (signal?.aborted) throw new UploadCancelled();

  const presign = await postJson<PresignResponse>("/api/upload/presign", {
    kind,
    mime,
    size: file.size,
    originalName: file.name,
    assignmentId,
  });

  const assetId = presign.assetId;
  const uploadId = presign.mode === "multipart" ? presign.uploadId : undefined;

  /** เก็บกวาดให้ไม่มี Asset ค้างสถานะ UPLOADING และไม่มี part ค้างกินพื้นที่ */
  const abandon = async () => {
    await postJson("/api/upload/complete", { action: "abort", assetId, uploadId }).catch(() => {});
  };

  try {
    if (presign.mode === "single") {
      await putWithProgress(presign.url, file, {
        contentType: mime,
        signal,
        onLoaded: (bytes) => onProgress?.(Math.round((bytes / file.size) * 100)),
      });

      const done = await postJson<CompleteResponse>("/api/upload/complete", {
        action: "complete",
        assetId,
      });
      onProgress?.(100);
      return toUploadedAsset(done);
    }

    const chunks = planParts(file.size, presign.partSize);
    const urlByPart = new Map(presign.parts.map((p) => [p.partNumber, p.url]));
    const loadedByPart = new Map<number, number>();
    const etags: { partNumber: number; etag: string }[] = [];

    const report = () => {
      let loaded = 0;
      for (const bytes of loadedByPart.values()) loaded += bytes;
      onProgress?.(Math.min(99, Math.round((loaded / file.size) * 100)));
    };

    /** ส่ง part เดียว พร้อมลองใหม่ด้วย URL ชุดใหม่เมื่อล้ม (URL ชุดแรกอาจหมดอายุกับไฟล์ใหญ่) */
    const sendPart = async (chunk: (typeof chunks)[number]) => {
      for (let attempt = 0; ; attempt++) {
        try {
          let url = urlByPart.get(chunk.partNumber);
          if (!url || attempt > 0) {
            const fresh = await postJson<{ url: string }>("/api/upload/part", {
              assetId,
              uploadId,
              partNumber: chunk.partNumber,
            });
            url = fresh.url;
            urlByPart.set(chunk.partNumber, url);
          }

          const result = await putWithProgress(url, file.slice(chunk.start, chunk.end), {
            signal,
            onLoaded: (bytes) => {
              loadedByPart.set(chunk.partNumber, bytes);
              report();
            },
          });

          loadedByPart.set(chunk.partNumber, chunk.end - chunk.start);
          report();
          if (result.etag) etags.push({ partNumber: chunk.partNumber, etag: result.etag });
          return;
        } catch (error) {
          if (error instanceof UploadCancelled || attempt >= PART_RETRIES) throw error;
          loadedByPart.set(chunk.partNumber, 0);
          report();
        }
      }
    };

    // คิวเดียวที่มีคนหยิบงานพร้อมกันหลายตัว — คุมจำนวนที่ส่งขนานได้โดยไม่ต้องแบ่งล็อตล่วงหน้า
    const queue = [...chunks];
    const workers = Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await sendPart(next);
      }
    });
    await Promise.all(workers);

    const done = await postJson<CompleteResponse>("/api/upload/complete", {
      action: "complete",
      assetId,
      uploadId,
      // ส่งเฉพาะตอนที่อ่าน ETag ได้ครบทุก part ไม่งั้นปล่อยให้ server ไปถาม storage เอง
      parts: etags.length === chunks.length ? etags : undefined,
    });
    onProgress?.(100);
    return toUploadedAsset(done);
  } catch (error) {
    await abandon();
    throw error;
  }
}

export { formatBytes };
