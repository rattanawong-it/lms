import { describe, expect, it } from "vitest";
import { planParts } from "@/features/uploads/lib/upload-client";
import { MULTIPART_PART_SIZE } from "@/lib/upload-limits";

/**
 * FR-05.1 — การแบ่ง part ของ multipart upload
 * part สุดท้ายต้องสั้นกว่าเพื่อนได้ แต่ห้ามมีช่องว่างหรือช่วงที่ซ้อนทับกัน
 * เพราะ storage จะต่อไฟล์ตามลำดับ part โดยไม่ตรวจอะไรให้
 */
describe("planParts", () => {
  it("ไฟล์ที่เล็กกว่าหนึ่ง part ได้ part เดียวเต็มขนาดไฟล์", () => {
    expect(planParts(1_000, 10)).toHaveLength(100);
    expect(planParts(5, 10)).toEqual([{ partNumber: 1, start: 0, end: 5 }]);
  });

  it("เศษที่เหลือกลายเป็น part สุดท้ายที่สั้นกว่า", () => {
    expect(planParts(25, 10)).toEqual([
      { partNumber: 1, start: 0, end: 10 },
      { partNumber: 2, start: 10, end: 20 },
      { partNumber: 3, start: 20, end: 25 },
    ]);
  });

  it("ช่วงไบต์ต่อกันสนิทและรวมแล้วเท่ากับขนาดไฟล์", () => {
    const size = 2 * MULTIPART_PART_SIZE + 12_345;
    const parts = planParts(size);

    expect(parts).toHaveLength(3);
    expect(parts[0]!.start).toBe(0);
    expect(parts.at(-1)!.end).toBe(size);

    let total = 0;
    parts.forEach((part, index) => {
      expect(part.partNumber).toBe(index + 1);
      if (index > 0) expect(part.start).toBe(parts[index - 1]!.end);
      total += part.end - part.start;
    });
    expect(total).toBe(size);
  });

  it("หมายเลข part เริ่มที่ 1 ตามที่ S3 กำหนด", () => {
    expect(planParts(0).map((p) => p.partNumber)).toEqual([1]);
  });
});
