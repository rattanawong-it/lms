import "server-only";
import { toScore } from "@/lib/decimal";
import type { Prisma } from "@/generated/prisma/client";
import { weightedTotal } from "@/features/gradebook/lib/calc";

/**
 * คะแนนรวมถ่วงน้ำหนักของผู้เรียนหนึ่งคน (null = น้ำหนักยังไม่ครบ 100%)
 * ใช้ใน transaction ของการตัดสินจบคอร์ส (เงื่อนไข minScore — Q4)
 */
export async function courseTotalFor(
  tx: Prisma.TransactionClient,
  courseId: string,
  userId: string,
): Promise<number | null> {
  const items = await tx.gradeItem.findMany({
    where: { courseId },
    select: { id: true, maxScore: true, weight: true, grades: { where: { userId }, select: { score: true } } },
  });
  return weightedTotal(
    items.map((i) => ({ id: i.id, maxScore: toScore(i.maxScore), weight: toScore(i.weight) })),
    new Map(items.map((i) => [i.id, toScore(i.grades[0]?.score ?? null)])),
  );
}
