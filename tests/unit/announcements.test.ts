import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementScope, NotificationType, Role } from "@/generated/prisma/enums";
import {
  announcementLink,
  canPostOrgAnnouncement,
  visibleAnnouncementWhere,
} from "@/features/announcements/lib/audience";
import {
  ANNOUNCEMENT_TITLE_MAX,
  createAnnouncementSchema,
  pinAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas";

/** `lib/notify` เขียนลง DB — แทนที่ด้วยตัวปลอมที่จดว่าถูกเรียกด้วยอะไร */
const createMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { notification: { createMany } } }));
// ช่องทางภายนอก (อีเมล) ทดสอบแยกที่ notify.test.ts
vi.mock("@/lib/notify/channels/email", () => ({ sendEmailNotifications: vi.fn(async () => 0) }));

const { chunk, notify, NOTIFY_CHUNK_SIZE } = await import("@/lib/notify");

const ID = "ckx1q2w3e4r5t6y7u8i9o0p1";

describe("canPostOrgAnnouncement (§4.1)", () => {
  const superAdmin = { role: Role.SUPER_ADMIN, departmentId: null };
  const deptAdmin = { role: Role.DEPT_ADMIN, departmentId: "dept-sci" };
  const instructor = { role: Role.INSTRUCTOR, departmentId: "dept-sci" };

  it("ประกาศทั้งระบบได้เฉพาะ Super Admin", () => {
    expect(canPostOrgAnnouncement(superAdmin, AnnouncementScope.GLOBAL, null)).toBe(true);
    expect(canPostOrgAnnouncement(deptAdmin, AnnouncementScope.GLOBAL, null)).toBe(false);
    expect(canPostOrgAnnouncement(instructor, AnnouncementScope.GLOBAL, null)).toBe(false);
  });

  it("Dept Admin ประกาศได้เฉพาะคณะของตัวเอง ส่วน Super Admin ได้ทุกคณะ", () => {
    expect(canPostOrgAnnouncement(deptAdmin, AnnouncementScope.DEPARTMENT, "dept-sci")).toBe(true);
    expect(canPostOrgAnnouncement(deptAdmin, AnnouncementScope.DEPARTMENT, "dept-law")).toBe(false);
    expect(canPostOrgAnnouncement(superAdmin, AnnouncementScope.DEPARTMENT, "dept-law")).toBe(true);
    expect(canPostOrgAnnouncement(instructor, AnnouncementScope.DEPARTMENT, "dept-sci")).toBe(false);
  });

  it("Dept Admin ที่ไม่สังกัดคณะ หรือไม่ระบุคณะ ถูกปฏิเสธ", () => {
    const orphan = { role: Role.DEPT_ADMIN, departmentId: null };
    expect(canPostOrgAnnouncement(orphan, AnnouncementScope.DEPARTMENT, "dept-sci")).toBe(false);
    expect(canPostOrgAnnouncement(superAdmin, AnnouncementScope.DEPARTMENT, null)).toBe(false);
  });

  it("ระดับคอร์สไม่ผ่านฟังก์ชันนี้ (ต้องใช้ assertCourseAccess)", () => {
    expect(canPostOrgAnnouncement(superAdmin, AnnouncementScope.COURSE, null)).toBe(false);
  });
});

describe("visibleAnnouncementWhere", () => {
  it("ทุกคนเห็นประกาศทั้งระบบ + คณะของตน + คอร์สที่เรียน/สอน", () => {
    expect(visibleAnnouncementWhere({ departmentId: "dept-sci" }, ["c1", "c2"])).toEqual({
      OR: [
        { scope: "GLOBAL" },
        { scope: "DEPARTMENT", departmentId: "dept-sci" },
        { scope: "COURSE", courseId: { in: ["c1", "c2"] } },
      ],
    });
  });

  it("ไม่สังกัดคณะและไม่มีคอร์ส → เห็นแค่ประกาศทั้งระบบ", () => {
    expect(visibleAnnouncementWhere({ departmentId: null }, [])).toEqual({
      OR: [{ scope: "GLOBAL" }],
    });
  });

  it("ลิงก์จากการแจ้งเตือนชี้ไปที่ anchor ของประกาศ", () => {
    expect(announcementLink("abc")).toBe("/announcements#a-abc");
  });
});

describe("createAnnouncementSchema", () => {
  const base = { scope: "GLOBAL", title: "  ปิดปรับปรุงระบบ  ", pinned: null };

  it("ตัดช่องว่างหัวข้อ และแปลง checkbox เป็น boolean", () => {
    const off = createAnnouncementSchema.parse(base);
    expect(off.title).toBe("ปิดปรับปรุงระบบ");
    expect(off.pinned).toBe(false);
    expect(createAnnouncementSchema.parse({ ...base, pinned: "on" }).pinned).toBe(true);
  });

  it("หัวข้อว่างหรือยาวเกินได้ข้อความภาษาไทย", () => {
    const empty = createAnnouncementSchema.safeParse({ ...base, title: "   " });
    expect(empty.error?.issues[0]?.message).toBe("กรุณากรอกหัวข้อประกาศ");

    const long = createAnnouncementSchema.safeParse({
      ...base,
      title: "ก".repeat(ANNOUNCEMENT_TITLE_MAX + 1),
    });
    expect(long.error?.issues[0]?.message).toContain(String(ANNOUNCEMENT_TITLE_MAX));
  });

  it("ระดับคณะต้องเลือกคณะ ระดับคอร์สต้องมีคอร์ส", () => {
    const dept = createAnnouncementSchema.safeParse({ ...base, scope: "DEPARTMENT", departmentId: "" });
    expect(dept.error?.issues[0]).toMatchObject({
      path: ["departmentId"],
      message: "กรุณาเลือกคณะที่จะประกาศ",
    });

    const course = createAnnouncementSchema.safeParse({ ...base, scope: "COURSE" });
    expect(course.error?.issues[0]?.path).toEqual(["courseId"]);
  });

  it("ระดับที่ไม่รู้จักถูกปฏิเสธ", () => {
    const bad = createAnnouncementSchema.safeParse({ ...base, scope: "EVERYONE" });
    expect(bad.error?.issues[0]?.message).toBe("กรุณาเลือกระดับของประกาศ");
  });
});

describe("update/pin schema", () => {
  it("ต้องมี id ที่เป็น cuid", () => {
    expect(updateAnnouncementSchema.safeParse({ id: "x", title: "a" }).success).toBe(false);
    expect(updateAnnouncementSchema.parse({ id: ID, title: "a" }).pinned).toBe(false);
  });

  it("pinned=\"false\" จากปุ่มเลิกปักหมุดต้องเป็น false จริง (ไม่ใช่ coerce เป็น true)", () => {
    expect(pinAnnouncementSchema.parse({ id: ID, pinned: "false" }).pinned).toBe(false);
    expect(pinAnnouncementSchema.parse({ id: ID, pinned: "true" }).pinned).toBe(true);
  });
});

describe("lib/notify", () => {
  beforeEach(() => {
    createMany.mockReset();
    createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  });

  it("chunk แบ่งรายการเป็นชุด ๆ", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("ตัด id ซ้ำ และแบ่ง INSERT เป็นชุดตามเพดาน", async () => {
    const ids = Array.from({ length: NOTIFY_CHUNK_SIZE + 5 }, (_, i) => `u${i}`);
    const sent = await notify({
      userIds: [...ids, "u0", "u1"],
      type: NotificationType.ANNOUNCEMENT,
      title: "ประกาศ: ทดสอบ",
      link: "/announcements#a-1",
    });

    expect(sent).toBe(ids.length);
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[0]![0].data[0]).toEqual({
      userId: "u0",
      type: NotificationType.ANNOUNCEMENT,
      title: "ประกาศ: ทดสอบ",
      body: null,
      link: "/announcements#a-1",
    });
  });

  it("ไม่มีผู้รับไม่ยิง query และ DB ล้มก็ไม่ throw", async () => {
    expect(await notify({ userIds: [], type: NotificationType.SYSTEM, title: "x" })).toBe(0);
    expect(createMany).not.toHaveBeenCalled();

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(
      notify({ userIds: ["u1"], type: NotificationType.SYSTEM, title: "x" }),
    ).resolves.toBe(0);
    log.mockRestore();
  });
});
