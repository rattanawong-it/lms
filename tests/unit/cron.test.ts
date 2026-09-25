import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, NotificationType, SubmissionStatus } from "@/generated/prisma/enums";
import {
  DUE_SOON_WINDOW_MS,
  activeLearners,
  dueDedupeKey,
  liveDedupeKey,
  olderThan,
  pendingSubmitters,
  soonRange,
} from "@/features/cron/lib/rules";
import { isCronAuthorized } from "@/features/cron/lib/auth";

/** FR-12.3 · NFR-05 — cron แจ้งล่วงหน้า + เก็บกวาด */

const assignmentFindMany = vi.fn();
const lessonFindMany = vi.fn();
const notify = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { assignment: { findMany: assignmentFindMany }, lesson: { findMany: lessonFindMany } },
}));
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));

const { runDueReminders, runLiveReminders } = await import("@/features/cron/jobs");

const NOW = new Date("2026-09-25T03:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("ช่วงเวลา", () => {
  it("ใกล้ถึง = หลังตอนนี้ (ไม่รวม) ถึงขอบ 24 ชม. (รวม)", () => {
    const range = soonRange(NOW, DUE_SOON_WINDOW_MS);
    expect(range.gt).toEqual(NOW);
    expect(range.lte).toEqual(new Date(NOW.getTime() + 24 * HOUR));
    expect(olderThan(NOW, 24 * HOUR)).toEqual(new Date("2026-09-24T03:00:00.000Z"));
  });

  it("key กันซ้ำผูกกับเวลา — เลื่อนกำหนดแล้วได้ key ใหม่", () => {
    const a = dueDedupeKey("a1", new Date("2026-09-26T00:00:00Z"));
    expect(a).toBe("due:a1:2026-09-26T00:00:00.000Z");
    expect(dueDedupeKey("a1", new Date("2026-09-27T00:00:00Z"))).not.toBe(a);
    expect(liveDedupeKey("l1", new Date("2026-09-25T03:30:00Z"))).toBe("live:l1:2026-09-25T03:30:00.000Z");
  });
});

describe("ตัวเลือกผู้รับ", () => {
  const enrollments = [
    { userId: "active", status: EnrollmentStatus.ACTIVE, expiresAt: null },
    { userId: "future", status: EnrollmentStatus.ACTIVE, expiresAt: new Date(NOW.getTime() + HOUR) },
    { userId: "expired", status: EnrollmentStatus.ACTIVE, expiresAt: new Date(NOW.getTime() - HOUR) },
    { userId: "edge", status: EnrollmentStatus.ACTIVE, expiresAt: NOW },
    { userId: "completed", status: EnrollmentStatus.COMPLETED, expiresAt: null },
    { userId: "dropped", status: EnrollmentStatus.DROPPED, expiresAt: null },
    { userId: "pending", status: EnrollmentStatus.PENDING, expiresAt: null },
  ];

  it("เฉพาะ ACTIVE ที่ยังไม่หมดอายุ", () => {
    expect(activeLearners(enrollments, NOW)).toEqual(["active", "future"]);
  });

  it("ยังไม่ส่ง หรือครั้งล่าสุดถูกส่งกลับให้แก้ = ต้องเตือน", () => {
    const learners = ["none", "submitted", "graded", "returned", "resubmitted"];
    const submissions = [
      { userId: "submitted", attemptNo: 1, status: SubmissionStatus.SUBMITTED },
      { userId: "graded", attemptNo: 1, status: SubmissionStatus.GRADED },
      { userId: "returned", attemptNo: 1, status: SubmissionStatus.RETURNED },
      { userId: "resubmitted", attemptNo: 1, status: SubmissionStatus.RETURNED },
      { userId: "resubmitted", attemptNo: 2, status: SubmissionStatus.SUBMITTED },
      { userId: "not-enrolled", attemptNo: 1, status: SubmissionStatus.RETURNED },
    ];
    expect(pendingSubmitters(learners, submissions)).toEqual(["none", "returned"]);
  });
});

describe("CRON_SECRET", () => {
  const secret = "0123456789abcdef-secret";
  it("ต้องตรงทุกตัว และปิดเมื่อไม่ได้ตั้งค่า", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("งาน cron", () => {
  beforeEach(() => {
    assignmentFindMany.mockReset();
    lessonFindMany.mockReset();
    notify.mockReset().mockImplementation(async ({ userIds }: { userIds: string[] }) => userIds.length);
  });

  it("reminders: ค้นงานในช่วง 24 ชม. ของคอร์สที่เผยแพร่ แจ้งผู้ที่ยังไม่ส่งพร้อม key กันซ้ำ", async () => {
    const dueAt = new Date(NOW.getTime() + 5 * HOUR);
    assignmentFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "รายงานบทที่ 1",
        dueAt,
        courseId: "c1",
        lessonId: "l1",
        course: {
          title: "คอร์สทดสอบ",
          enrollments: [
            { userId: "u1", status: EnrollmentStatus.ACTIVE, expiresAt: null },
            { userId: "u2", status: EnrollmentStatus.ACTIVE, expiresAt: null },
          ],
        },
        submissions: [{ userId: "u2", attemptNo: 1, status: SubmissionStatus.SUBMITTED }],
      },
    ]);

    await expect(runDueReminders(NOW)).resolves.toEqual({ items: 1, notified: 1 });
    const where = assignmentFindMany.mock.calls[0]![0].where;
    expect(where.dueAt).toEqual(soonRange(NOW, DUE_SOON_WINDOW_MS));
    expect(where.course).toEqual({ status: "PUBLISHED" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["u1"],
        type: NotificationType.DUE_SOON,
        link: "/learn/c1/l1",
        dedupeKey: dueDedupeKey("a1", dueAt),
      }),
    );
    expect(notify.mock.calls[0]![0].title).toContain("รายงานบทที่ 1");
  });

  it("live: แจ้งผู้เรียนของคอร์สพร้อม key ตามเวลาเริ่ม", async () => {
    const startAt = new Date(NOW.getTime() + 30 * 60 * 1000);
    lessonFindMany.mockResolvedValue([
      {
        id: "l9",
        title: "สอนสด",
        liveStartAt: startAt,
        section: {
          course: {
            id: "c1",
            title: "คอร์สทดสอบ",
            enrollments: [
              { userId: "u1", status: EnrollmentStatus.ACTIVE, expiresAt: null },
              { userId: "u3", status: EnrollmentStatus.COMPLETED, expiresAt: null },
            ],
          },
        },
      },
    ]);

    await expect(runLiveReminders(NOW)).resolves.toEqual({ items: 1, notified: 1 });
    expect(lessonFindMany.mock.calls[0]![0].where.type).toBe("LIVE");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["u1"],
        type: NotificationType.LIVE_SOON,
        link: "/learn/c1/l9",
        dedupeKey: liveDedupeKey("l9", startAt),
      }),
    );
  });
});
