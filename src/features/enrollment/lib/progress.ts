import type { CompletionRule } from "@/features/courses/schemas";

/**
 * M06 — สูตรความคืบหน้า กติกาเรียนตามลำดับ และการตัดสินว่าจบคอร์ส
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น pure function ไม่แตะ DB และไม่มี `server-only`
 * เพราะทั้งฝั่ง server (actions/queries) และ client (ปุ่มบนหน้าเรียน) ใช้ชุดเดียวกัน
 * ความถูกต้องของ % และการล็อกบทเรียนจึงทดสอบได้ตรง ๆ ด้วย unit test
 */

/** บทเรียนหนึ่งบทเท่าที่สูตรต้องรู้ */
export type OutlineLesson = {
  id: string;
  /** บทเรียนตัวอย่างที่เปิดให้ดูได้โดยไม่ต้องเรียนบทก่อนหน้า */
  isPreview: boolean;
  /** ผู้เรียนคนนี้ทำบทนี้จบแล้วหรือยัง */
  completed: boolean;
};

/** FR-06.3 — ดูวิดีโอถึงสัดส่วนนี้ของความยาว ถือว่าจบบทเรียนอัตโนมัติ */
export const VIDEO_COMPLETE_RATIO = 0.9;

/** FR-06.3 — ระยะห่างระหว่างการบันทึกตำแหน่งวิดีโอ (วินาที) ตาม flow §5.3 */
export const PROGRESS_SAVE_INTERVAL_SEC = 15;

/**
 * FR-06.3 — เปอร์เซ็นต์ความคืบหน้าของคอร์ส
 *
 * ปัดเป็นจำนวนเต็มเพราะ `Enrollment.progressPct` เป็น Int
 * และไม่ยอมให้ปัดขึ้นเป็น 100 ทั้งที่ยังเหลือบทที่ไม่จบ — 100% ต้องแปลว่าจบครบจริง ๆ
 */
export function calcProgressPct(completedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const done = Math.max(0, Math.min(completedCount, totalCount));
  if (done >= totalCount) return 100;
  return Math.min(99, Math.round((done / totalCount) * 100));
}

/** FR-06.3 — ดูวิดีโอถึงตำแหน่งนี้แล้วนับว่าจบบทเรียนหรือยัง */
export function reachedVideoCompletion(
  positionSec: number,
  durationSec: number | null,
): boolean {
  if (!durationSec || durationSec <= 0) return false;
  return positionSec >= durationSec * VIDEO_COMPLETE_RATIO;
}

/**
 * FR-06.5 — บทเรียนลำดับที่ `index` เปิดเรียนได้หรือยัง
 *
 * ปลดล็อกเมื่อบทก่อนหน้า **ทุกบท** จบแล้ว ไม่ใช่แค่บทที่ติดกัน
 * เพราะผู้เรียนอาจเคยเรียนข้ามมาก่อนที่ผู้สอนจะเปิดโหมดเรียนตามลำดับ
 * บทเรียนตัวอย่าง (`isPreview`) เปิดได้เสมอ — เป็นบทที่ใครก็ดูได้จากหน้าคอร์สอยู่แล้ว
 */
export function isLessonUnlocked(
  lessons: OutlineLesson[],
  index: number,
  sequential: boolean,
): boolean {
  if (index < 0 || index >= lessons.length) return false;
  if (!sequential) return true;
  if (lessons[index]!.isPreview) return true;
  return lessons.slice(0, index).every((lesson) => lesson.completed || lesson.isPreview);
}

/** ชุด id ของบทเรียนที่เปิดเรียนได้ตอนนี้ — ใช้ตัดสินทั้งฝั่งหน้าเว็บและฝั่ง action */
export function unlockedLessonIds(
  lessons: OutlineLesson[],
  sequential: boolean,
): Set<string> {
  const ids = new Set<string>();
  lessons.forEach((lesson, index) => {
    if (isLessonUnlocked(lessons, index, sequential)) ids.add(lesson.id);
  });
  return ids;
}

/**
 * FR-06.4 — บทเรียนที่ปุ่ม "เรียนต่อ" ควรพาไป
 *
 * 1. บทล่าสุดที่ค้างไว้ ถ้ายังอยู่ในคอร์สและยังเปิดเรียนได้
 * 2. บทแรกที่ยังไม่จบและเปิดเรียนได้
 * 3. บทแรกของคอร์ส (กรณีเรียนจบหมดแล้ว — กดเพื่อกลับไปทบทวน)
 */
export function resumeLessonId(
  lessons: OutlineLesson[],
  lastLessonId: string | null,
  sequential: boolean,
): string | null {
  if (lessons.length === 0) return null;

  const unlocked = unlockedLessonIds(lessons, sequential);

  if (lastLessonId && unlocked.has(lastLessonId)) return lastLessonId;

  const nextUnfinished = lessons.find((lesson) => !lesson.completed && unlocked.has(lesson.id));
  if (nextUnfinished) return nextUnfinished.id;

  return lessons[0]!.id;
}

/** ผลการทำแบบทดสอบของคอร์ส — M07 จะเป็นผู้ส่งค่านี้เข้ามา */
export type QuizOutcome = {
  /** ผ่านแบบทดสอบครบทุกชุดในคอร์ส */
  allPassed: boolean;
  /** คะแนนรวมคิดเป็นเปอร์เซ็นต์ (null = ยังไม่มีคะแนน) */
  totalScorePct: number | null;
};

/**
 * FR-04.7 — ผู้เรียนเข้าเงื่อนไขจบคอร์สแล้วหรือยัง
 *
 * Phase 1 ยังไม่มี M07 จึงเรียกโดยไม่ส่ง `quiz` และเงื่อนไขที่อิงแบบทดสอบจะถูกข้าม
 * (คอร์สในเฟสนี้ยังไม่มีแบบทดสอบให้ไม่ผ่านอยู่แล้ว) เมื่อ M07 เสร็จให้ส่ง `quiz` เข้ามา
 * แล้วเงื่อนไขสองข้อล่างจะทำงานทันทีโดยไม่ต้องแก้สูตรตรงนี้
 */
export function meetsCompletionRule(
  progressPct: number,
  rule: CompletionRule,
  quiz?: QuizOutcome,
): boolean {
  if (progressPct < rule.minProgress) return false;
  if (!quiz) return true;
  if (rule.requireQuizPass && !quiz.allPassed) return false;
  if (rule.minScore !== null && (quiz.totalScorePct ?? 0) < rule.minScore) return false;
  return true;
}
