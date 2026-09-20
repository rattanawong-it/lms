import { z } from "zod";
import { AssetKind } from "@/generated/prisma/enums";

/** ขอ presigned URL เพื่อเริ่มอัปโหลด */
export const presignInputSchema = z.object({
  kind: z.enum(AssetKind),
  mime: z.string().min(1, "ต้องระบุชนิดไฟล์"),
  size: z.int().positive("ขนาดไฟล์ต้องมากกว่า 0"),
  originalName: z.string().min(1, "ต้องระบุชื่อไฟล์").max(255, "ชื่อไฟล์ยาวเกินไป"),
});
export type PresignInput = z.infer<typeof presignInputSchema>;

/** ขอ URL ของ part ใหม่ เมื่อ part เดิมหมดอายุหรืออัปโหลดล้ม */
export const signPartInputSchema = z.object({
  assetId: z.cuid("รหัสไฟล์ไม่ถูกต้อง"),
  uploadId: z.string().min(1),
  partNumber: z.int().min(1).max(10_000),
});

/** ปิดงานอัปโหลด — ยืนยันสำเร็จ หรือยกเลิกแล้วเก็บกวาด */
export const completeInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    assetId: z.cuid("รหัสไฟล์ไม่ถูกต้อง"),
    uploadId: z.string().min(1).optional(),
    parts: z
      .array(z.object({ partNumber: z.int().min(1), etag: z.string().min(1) }))
      .optional(),
  }),
  z.object({
    action: z.literal("abort"),
    assetId: z.cuid("รหัสไฟล์ไม่ถูกต้อง"),
    uploadId: z.string().min(1).optional(),
  }),
]);
export type CompleteInput = z.infer<typeof completeInputSchema>;
