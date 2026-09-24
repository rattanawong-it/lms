import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType } from "@/generated/prisma/enums";
import {
  defaultNotifyPrefs,
  notifyPrefsFromForm,
  parseNotifyPrefs,
  pickRecipients,
  prefFieldName,
  wantsChannel,
} from "@/lib/notify/prefs";

/** M11 · FR-11.3/11.4 — การตั้งค่าช่องทาง + ช่องทางอีเมลของ notify() */

const createMany = vi.fn();
const findMany = vi.fn();
const sendMail = vi.fn();
const afterTasks: Promise<unknown>[] = [];

vi.mock("@/lib/db", () => ({ db: { notification: { createMany }, user: { findMany } } }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://lms.example.ac.th" }, hasLine: false }));
vi.mock("@/lib/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail")>()),
  sendMail,
}));
vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

const { notify } = await import("@/lib/notify");
const { absoluteLink, buildNotificationEmail, escapeHtml } = await import("@/lib/notify/channels/email");

describe("notifyPrefs (FR-11.4)", () => {
  it("ค่าเริ่มต้น: เปิดอีเมลเฉพาะเหตุการณ์ที่ FR-11.3 ระบุ · ประกาศปิด", () => {
    const prefs = defaultNotifyPrefs();
    for (const t of [NotificationType.ENROLLED, NotificationType.GRADED, NotificationType.DUE_SOON, NotificationType.CERTIFICATE]) {
      expect(prefs[t].email).toBe(true);
    }
    for (const t of [NotificationType.ANNOUNCEMENT, NotificationType.LIVE_SOON, NotificationType.QA_REPLY, NotificationType.SYSTEM]) {
      expect(prefs[t].email).toBe(false);
    }
  });

  it("อ่านค่าที่เก็บไว้แบบไม่เชื่อรูปแบบ — key แปลก/ค่าผิดชนิดใช้ค่าเริ่มต้น", () => {
    expect(parseNotifyPrefs(null)).toEqual(defaultNotifyPrefs());
    expect(parseNotifyPrefs("{}")).toEqual(defaultNotifyPrefs());
    expect(parseNotifyPrefs([1, 2])).toEqual(defaultNotifyPrefs());

    const prefs = parseNotifyPrefs({
      GRADED: { email: false, line: "yes" },
      ANNOUNCEMENT: { email: true },
      NOT_A_TYPE: { email: true },
      CERTIFICATE: "off",
    });
    expect(prefs.GRADED).toEqual({ email: false, line: true });
    expect(prefs.ANNOUNCEMENT).toEqual({ email: true, line: false });
    expect(prefs.CERTIFICATE).toEqual({ email: true, line: true });
    expect(prefs).not.toHaveProperty("NOT_A_TYPE");
  });

  it("เลือกผู้รับตามการตั้งค่าของแต่ละคน", () => {
    const users = [
      { id: "a", notifyPrefs: {} },
      { id: "b", notifyPrefs: { GRADED: { email: false } } },
      { id: "c", notifyPrefs: { ANNOUNCEMENT: { email: true } } },
    ];
    expect(pickRecipients(users, NotificationType.GRADED, "email").map((u) => u.id)).toEqual(["a", "c"]);
    expect(pickRecipients(users, NotificationType.ANNOUNCEMENT, "email").map((u) => u.id)).toEqual(["c"]);
    expect(wantsChannel({}, NotificationType.GRADED, "line")).toBe(true);
  });

  it("ฟอร์ม: ไม่ติ๊ก = ปิด · ช่องทางที่แก้ไม่ได้คงค่าเดิม", () => {
    const form = new FormData();
    form.set(prefFieldName(NotificationType.ANNOUNCEMENT, "email"), "on");
    // ช่อง LINE ถูก disable จึงไม่ถูกส่งมา แม้ผู้ใช้เคยปิด GRADED.line ไว้
    const next = notifyPrefsFromForm(form, { GRADED: { line: false } }, ["email"]);
    expect(next.ANNOUNCEMENT.email).toBe(true);
    expect(next.GRADED.email).toBe(false);
    expect(next.ENROLLED.email).toBe(false);
    expect(next.GRADED.line).toBe(false);
    expect(next.ENROLLED.line).toBe(true);
  });
});

describe("อีเมลแจ้งเตือน (FR-11.3)", () => {
  it("escape HTML ของข้อความที่ผู้ใช้ตั้ง และทำลิงก์เป็น URL เต็ม", () => {
    expect(escapeHtml(`<b>"A&B"</b>'`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;&#39;");
    expect(absoluteLink("/learn/c1")).toBe("https://lms.example.ac.th/learn/c1");
    expect(absoluteLink(null)).toBe("https://lms.example.ac.th/notifications");
    expect(absoluteLink("https://evil.example/x")).toBe("https://lms.example.ac.th/notifications");
    expect(absoluteLink("//evil.example/x")).toBe("https://lms.example.ac.th/notifications");
    expect(absoluteLink("/\\evil.example/x")).toBe("https://lms.example.ac.th/notifications");

    const mail = buildNotificationEmail({
      type: NotificationType.GRADED,
      title: `ได้รับคะแนนงาน <script>alert(1)</script>`,
      body: null,
      link: "/learn/c1/grades",
    });
    expect(mail.subject).toBe("ได้รับคะแนนงาน <script>alert(1)</script>");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("https://lms.example.ac.th/learn/c1/grades");
    expect(mail.html).toContain("https://lms.example.ac.th/settings/notifications");
    expect(mail.text).toContain("ผู้สอนตรวจแบบทดสอบหรืองานของคุณแล้ว");
  });
});

describe("notify() — ในแอปทันที + อีเมลหลัง response", () => {
  beforeEach(() => {
    createMany.mockReset().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    findMany.mockReset();
    sendMail.mockReset().mockResolvedValue(undefined);
    afterTasks.length = 0;
  });

  it("ส่งอีเมลเฉพาะผู้ที่เปิดไว้ · ค้นเฉพาะบัญชีที่ไม่ถูกระงับและยืนยันอีเมลแล้ว", async () => {
    findMany.mockResolvedValue([
      { email: "on@krirk.ac.th", notifyPrefs: {} },
      { email: "off@krirk.ac.th", notifyPrefs: { CERTIFICATE: { email: false } } },
    ]);
    const created = await notify({
      userIds: ["u1", "u2", "u1"],
      type: NotificationType.CERTIFICATE,
      title: "ได้รับใบประกาศ “คอร์สทดสอบ”",
      link: "/certificates",
    });
    expect(created).toBe(2);
    await Promise.all(afterTasks);

    expect(findMany.mock.calls[0]![0].where).toEqual({ id: { in: ["u1", "u2"] }, banned: false, emailVerified: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: "on@krirk.ac.th", subject: "ได้รับใบประกาศ “คอร์สทดสอบ”" });
  });

  it("อีเมลล้มไม่กระทบผลของ notify() และไม่ throw", async () => {
    findMany.mockResolvedValue([
      { email: "a@krirk.ac.th", notifyPrefs: {} },
      { email: "b@krirk.ac.th", notifyPrefs: {} },
    ]);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notify({ userIds: ["u1", "u2"], type: NotificationType.GRADED, title: "x" })).resolves.toBe(2);
    await Promise.all(afterTasks);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("[notify:email] ส่งอีเมลไม่สำเร็จ", expect.any(Error));

    findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(notify({ userIds: ["u1"], type: NotificationType.GRADED, title: "x" })).resolves.toBe(1);
    await Promise.all(afterTasks);
    log.mockRestore();
  });
});
