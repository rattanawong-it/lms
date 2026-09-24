import { beforeEach, describe, expect, it, vi } from "vitest";
import { signLineBody, verifyLineSignature } from "@/lib/line/signature";
import { LINE_REPLY, lineWebhookSchema, parseLinkCode } from "@/features/line/schemas";

/** M12 · FR-12.1/12.2/12.4 — LINE webhook, รหัสผูกบัญชี และข้อความแจ้งเตือน */

const redeemLinkCode = vi.fn();
const unlink = vi.fn();
const replyText = vi.fn();

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://lms.example.ac.th" }, hasLine: true }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/line/lib/link", () => ({ redeemLinkCode, unlink }));
vi.mock("@/lib/line/client", () => ({ replyText, multicastText: vi.fn() }));

const { handleLineEvent, CODE_QUOTA } = await import("@/features/line/lib/webhook");
const { buildLineText } = await import("@/lib/notify/channels/line");
const { resetRateLimits } = await import("@/lib/rate-limit");

const SECRET = "test-channel-secret";

describe("X-Line-Signature", () => {
  const body = JSON.stringify({ events: [{ type: "follow" }], destination: "Uxxx" });

  it("ลายเซ็นที่ถูกต้องผ่าน · body ถูกแก้/secret ผิด/ไม่มี header ไม่ผ่าน", () => {
    const sig = signLineBody(body, SECRET);
    expect(verifyLineSignature(body, sig, SECRET)).toBe(true);
    expect(verifyLineSignature(body + " ", sig, SECRET)).toBe(false);
    expect(verifyLineSignature(body, sig, "other-secret")).toBe(false);
    expect(verifyLineSignature(body, null, SECRET)).toBe(false);
    expect(verifyLineSignature(body, "", SECRET)).toBe(false);
    expect(verifyLineSignature(body, "short", SECRET)).toBe(false);
    expect(verifyLineSignature(body, sig, "")).toBe(false);
  });

  it("เซ็นจากไบต์ UTF-8 ของ body ดิบ (ข้อความไทย)", () => {
    const thai = JSON.stringify({ events: [{ type: "message", message: { type: "text", text: "สวัสดี" } }] });
    expect(verifyLineSignature(thai, signLineBody(thai, SECRET), SECRET)).toBe(true);
  });
});

describe("รหัสผูกบัญชี 6 หลัก", () => {
  it("ยอมช่องว่างคั่น · ไม่รับความยาวอื่นหรือตัวอักษร", () => {
    expect(parseLinkCode("123456")).toBe("123456");
    expect(parseLinkCode(" 123 456 ")).toBe("123456");
    expect(parseLinkCode("012345")).toBe("012345");
    expect(parseLinkCode("12345")).toBeNull();
    expect(parseLinkCode("1234567")).toBeNull();
    expect(parseLinkCode("12a456")).toBeNull();
    expect(parseLinkCode("สวัสดี")).toBeNull();
  });

  it("schema ของ webhook รับ field ที่ไม่รู้จักได้ แต่ต้องมี events", () => {
    expect(lineWebhookSchema.safeParse({ destination: "U1", events: [] }).success).toBe(true);
    expect(lineWebhookSchema.safeParse({ events: [{ type: "follow", mode: "active", timestamp: 1 }] }).success).toBe(true);
    expect(lineWebhookSchema.safeParse({}).success).toBe(false);
  });
});

describe("handleLineEvent", () => {
  const source = { type: "user", userId: "U-line-1" };

  beforeEach(() => {
    redeemLinkCode.mockReset();
    unlink.mockReset();
    replyText.mockReset().mockResolvedValue(true);
    resetRateLimits();
  });

  it("ส่งรหัสถูก → ผูกบัญชีแล้วตอบว่าสำเร็จ", async () => {
    redeemLinkCode.mockResolvedValue("user-1");
    await handleLineEvent({ type: "message", replyToken: "r1", source, message: { type: "text", text: "123 456" } });
    expect(redeemLinkCode).toHaveBeenCalledWith("123456", "U-line-1");
    expect(replyText).toHaveBeenCalledWith("r1", LINE_REPLY.linked);
  });

  it("รหัสผิด/หมดอายุ → ตอบให้ขอรหัสใหม่ · ลองเกินโควตาไม่ตรวจรหัสอีก", async () => {
    redeemLinkCode.mockResolvedValue(null);
    for (let i = 0; i < CODE_QUOTA.max; i += 1) {
      await handleLineEvent({ type: "message", replyToken: `r${i}`, source, message: { type: "text", text: "000000" } });
    }
    expect(replyText).toHaveBeenLastCalledWith(`r${CODE_QUOTA.max - 1}`, LINE_REPLY.invalidCode);
    await handleLineEvent({ type: "message", replyToken: "rx", source, message: { type: "text", text: "000001" } });
    expect(redeemLinkCode).toHaveBeenCalledTimes(CODE_QUOTA.max);
    expect(replyText).toHaveBeenLastCalledWith("rx", LINE_REPLY.tooMany);
  });

  it("ข้อความอื่น/follow → ตอบวิธีผูกบัญชี · unfollow → ยกเลิกการผูก", async () => {
    await handleLineEvent({ type: "message", replyToken: "r1", source, message: { type: "text", text: "สวัสดี" } });
    await handleLineEvent({ type: "message", replyToken: "r2", source, message: { type: "sticker" } });
    await handleLineEvent({ type: "follow", replyToken: "r3", source });
    expect(replyText.mock.calls.map((c) => c[1])).toEqual([LINE_REPLY.help, LINE_REPLY.help, LINE_REPLY.help]);

    await handleLineEvent({ type: "unfollow", source });
    expect(unlink).toHaveBeenCalledWith({ lineUserId: "U-line-1" }, "unfollow");
    expect(redeemLinkCode).not.toHaveBeenCalled();
  });

  it("ไม่สนใจ event จากกลุ่มหรือที่ไม่มี userId", async () => {
    await handleLineEvent({ type: "message", replyToken: "r1", source: { type: "group" }, message: { type: "text", text: "123456" } });
    await handleLineEvent({ type: "unfollow" });
    expect(redeemLinkCode).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(replyText).not.toHaveBeenCalled();
  });
});

describe("ข้อความแจ้งเตือนทาง LINE (FR-12.2)", () => {
  it("หัวข้อ + เนื้อหา + ลิงก์เต็ม · ไม่มีเนื้อหาก็ไม่เว้นบรรทัดเปล่า", () => {
    expect(buildLineText({ title: "ได้รับคะแนน", body: "งานท้ายบท 8/10", link: "/learn/c1/grades" })).toBe(
      "ได้รับคะแนน\n\nงานท้ายบท 8/10\n\nhttps://lms.example.ac.th/learn/c1/grades",
    );
    expect(buildLineText({ title: "ได้รับใบประกาศ", body: null, link: "//evil.example" })).toBe(
      "ได้รับใบประกาศ\n\nhttps://lms.example.ac.th/notifications",
    );
  });
});
