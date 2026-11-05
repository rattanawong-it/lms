import { describe, expect, it } from "vitest";
import { SubmissionMode, SubmissionStatus } from "@/generated/prisma/enums";
import {
  extensionOf,
  gradeScoreError,
  isPastDue,
  latestPerStudent,
  submissionFileError,
  submissionMime,
  submitState,
} from "@/features/assignments/lib/rules";
import {
  assignmentSettingsSchema,
  gradeSubmissionSchema,
  submitAssignmentSchema,
} from "@/features/assignments/schemas";

const due = new Date("2026-10-01T10:00:00Z");
const before = new Date("2026-10-01T09:59:59Z");
const after = new Date("2026-10-01T10:00:01Z");

describe("กำหนดส่งและการส่งซ้ำ (FR-08.2 · FR-08.3 · FR-08.4)", () => {
  it("ส่งช้าเมื่อเลยกำหนด · ไม่มีกำหนดไม่เคยช้า", () => {
    expect(isPastDue(due, before)).toBe(false);
    expect(isPastDue(due, due)).toBe(false);
    expect(isPastDue(due, after)).toBe(true);
    expect(isPastDue(null, after)).toBe(false);
  });

  it("ยังไม่เคยส่ง: ก่อนกำหนดส่งได้ · หลังกำหนดส่งได้เมื่อรับงานช้า (ติดป้ายช้า)", () => {
    expect(submitState({ dueAt: due, allowLate: false }, null, before)).toEqual({ canSubmit: true, resubmit: false, late: false });
    expect(submitState({ dueAt: due, allowLate: true }, null, after)).toEqual({ canSubmit: true, resubmit: false, late: true });
    expect(submitState({ dueAt: due, allowLate: false }, null, after)).toMatchObject({ canSubmit: false });
    expect(submitState({ dueAt: null, allowLate: false }, null, after)).toMatchObject({ canSubmit: true, late: false });
  });

  it("ส่งแล้วรอตรวจ: ส่งใหม่ได้ก่อนกำหนดเท่านั้น", () => {
    const submitted = { status: SubmissionStatus.SUBMITTED, isLate: false };
    expect(submitState({ dueAt: due, allowLate: true }, submitted, before)).toEqual({ canSubmit: true, resubmit: true, late: false });
    expect(submitState({ dueAt: due, allowLate: true }, submitted, after)).toEqual({
      canSubmit: false,
      reason: "เลยกำหนดส่งแล้ว แก้ไขงานที่ส่งไม่ได้",
    });
  });

  it("ส่งกลับให้แก้: ส่งใหม่ได้แม้เลยกำหนดและไม่รับงานช้า · ความช้าตามงานเดิม", () => {
    const onTime = { status: SubmissionStatus.RETURNED, isLate: false };
    const late = { status: SubmissionStatus.RETURNED, isLate: true };
    expect(submitState({ dueAt: due, allowLate: false }, onTime, after)).toEqual({ canSubmit: true, resubmit: true, late: false });
    expect(submitState({ dueAt: due, allowLate: true }, late, after)).toEqual({ canSubmit: true, resubmit: true, late: true });
  });

  it("ตรวจแล้ว: ปิด", () => {
    expect(
      submitState({ dueAt: null, allowLate: true }, { status: SubmissionStatus.GRADED, isLate: false }, before),
    ).toEqual({ canSubmit: false, reason: "ผู้สอนตรวจงานนี้แล้ว" });
  });

  it("ส่งล่าสุดของแต่ละคน", () => {
    const rows = [
      { id: "a1", userId: "a", attemptNo: 1 },
      { id: "a3", userId: "a", attemptNo: 3 },
      { id: "b1", userId: "b", attemptNo: 1 },
      { id: "a2", userId: "a", attemptNo: 2 },
    ];
    expect(latestPerStudent(rows).map((r) => r.id).sort()).toEqual(["a3", "b1"]);
  });
});

describe("ไฟล์ที่ส่ง", () => {
  const rule = { allowedTypes: ["pdf", "docx", "zip"], maxFileMb: 2 };

  it("นามสกุลและ MIME มาจากนามสกุลที่อนุญาต ไม่ใช่ค่าที่เบราว์เซอร์เดา", () => {
    expect(extensionOf("รายงาน.final.PDF")).toBe("pdf");
    expect(extensionOf("README")).toBe("");
    expect(submissionMime("งาน.zip")).toBe("application/zip");
    expect(submissionMime("งาน.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(submissionMime("virus.exe")).toBeNull();
  });

  it("ตรวจชนิดและขนาดตามงาน", () => {
    expect(submissionFileError({ name: "a.pdf", size: 1024 }, rule)).toBeNull();
    expect(submissionFileError({ name: "a.png", size: 1024 }, rule)).toBe("งานนี้รับเฉพาะไฟล์ .pdf, .docx, .zip");
    expect(submissionFileError({ name: "a.exe", size: 1 }, { ...rule, allowedTypes: ["exe"] })).toMatch(/รับเฉพาะไฟล์/);
    expect(submissionFileError({ name: "a.pdf", size: 2 * 1024 * 1024 + 1 }, rule)).toBe("ไฟล์ต้องไม่เกิน 2 MB");
  });
});

describe("schema (ข้อความไทย)", () => {
  const base = {
    title: "รายงานบทที่ 1",
    lessonId: "none",
    dueAt: "2026-10-01T17:00",
    allowLate: "on",
    maxScore: "10",
    allowedTypes: ["pdf", "pdf", "zip"],
    maxFileMb: "20",
  };

  it("ตั้งค่างาน: กำหนดส่งเป็นเวลาไทย · ชนิดไฟล์ไม่ซ้ำ", () => {
    const parsed = assignmentSettingsSchema.parse(base);
    expect(parsed.dueAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(parsed.allowedTypes).toEqual(["pdf", "zip"]);
    expect(parsed.lessonId).toBeNull();
    expect(parsed.allowLate).toBe(true);
  });

  it("ตั้งค่างาน: ค่าที่ผิด", () => {
    const issues = (input: object) =>
      assignmentSettingsSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.message);
    expect(issues({ allowedTypes: [] })).toContain("เลือกชนิดไฟล์ที่รับอย่างน้อย 1 ชนิด");
    expect(issues({ allowedTypes: ["exe"] })).toContain("ชนิดไฟล์ไม่ถูกต้อง");
    expect(issues({ maxFileMb: "26" })).toContain("ขนาดไฟล์ได้ไม่เกิน 25 MB");
    expect(issues({ maxScore: "0" })).toContain("คะแนนเต็มต้องมากกว่า 0");
    expect(issues({ maxScore: "1.234" })).toContain("คะแนนละเอียดได้ไม่เกิน 2 ตำแหน่ง");
  });

  it("ตั้งค่างาน: โหมดข้อความอย่างเดียวไม่ต้องเลือกชนิดไฟล์ (CHANGELOG #53)", () => {
    expect(assignmentSettingsSchema.parse(base).submissionMode).toBe(SubmissionMode.TEXT_OR_FILE);
    const textOnly = assignmentSettingsSchema.safeParse({ ...base, submissionMode: "TEXT", allowedTypes: [] });
    expect(textOnly.success).toBe(true);
    const fileOnly = assignmentSettingsSchema.safeParse({ ...base, submissionMode: "FILE", allowedTypes: [] });
    expect(fileOnly.error?.issues[0]?.message).toBe("เลือกชนิดไฟล์ที่รับอย่างน้อย 1 ชนิด");
    expect(assignmentSettingsSchema.safeParse({ ...base, submissionMode: "BOTH" }).error?.issues[0]?.message).toBe(
      "เลือกช่องทางส่งงาน",
    );
  });

  const doc = (...nodes: object[]) => JSON.stringify({ type: "doc", content: nodes });
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const ASSET = "ckabcdefghijklmnopqrstuvw";

  it("ส่งงาน: ต้องมีข้อความหรือไฟล์", () => {
    const schema = submitAssignmentSchema(SubmissionMode.TEXT_OR_FILE);
    expect(schema.safeParse({ content: doc({ type: "paragraph" }), assetIds: [] }).error?.issues[0]?.message).toBe(
      "พิมพ์คำตอบหรือแนบไฟล์อย่างน้อยหนึ่งอย่าง",
    );
    expect(schema.parse({ content: doc(para("คำตอบ")), assetIds: [] })).toEqual({
      content: { type: "doc", content: [para("คำตอบ")] },
      assetIds: [],
    });
    expect(schema.parse({ content: "", assetIds: [ASSET] }).content).toBeNull();
  });

  it("ส่งงาน: ช่องทางตามที่ผู้สอนตั้ง", () => {
    const text = submitAssignmentSchema(SubmissionMode.TEXT);
    expect(text.safeParse({ content: "", assetIds: [] }).error?.issues[0]?.message).toBe("พิมพ์คำตอบก่อนส่ง");
    expect(text.safeParse({ content: doc(para("ก")), assetIds: [ASSET] }).error?.issues[0]?.message).toBe(
      "งานนี้รับเฉพาะข้อความ",
    );
    const file = submitAssignmentSchema(SubmissionMode.FILE);
    expect(file.safeParse({ content: "", assetIds: [] }).error?.issues[0]?.message).toBe("แนบไฟล์อย่างน้อย 1 ไฟล์");
    expect(file.safeParse({ content: doc(para("ก")), assetIds: [ASSET] }).error?.issues[0]?.message).toBe(
      "งานนี้รับเฉพาะไฟล์",
    );
  });

  it("ส่งงาน: ตัดรูป/YouTube ทิ้ง · จำกัดความยาวที่ข้อความ", () => {
    const schema = submitAssignmentSchema(SubmissionMode.TEXT);
    const parsed = schema.parse({
      content: doc(
        para("คำตอบ"),
        { type: "image", attrs: { src: "/api/media/ckabcdefghijklmnopqrstuvw" } },
        { type: "youtube", attrs: { src: "https://www.youtube.com/embed/abc" } },
      ),
      assetIds: [],
    });
    expect(parsed.content).toEqual({ type: "doc", content: [para("คำตอบ")] });
    // มีแต่รูป = ไม่มีคำตอบ
    expect(
      schema.safeParse({ content: doc({ type: "image", attrs: { src: "/api/media/ckabcdefghijklmnopqrstuvw" } }), assetIds: [] })
        .error?.issues[0]?.message,
    ).toBe("พิมพ์คำตอบก่อนส่ง");
    const long = Array.from({ length: 3 }, () => para("ก".repeat(7_000)));
    expect(schema.safeParse({ content: doc(...long), assetIds: [] }).error?.issues[0]?.message).toBe(
      "ข้อความยาวได้ไม่เกิน 20,000 ตัวอักษร",
    );
  });

  it("ตรวจงาน: ให้คะแนนต้องมีคะแนน · ส่งกลับต้องมีความเห็น", () => {
    expect(gradeSubmissionSchema.safeParse({ decision: "grade", score: "" }).error?.issues[0]?.message).toBe("กรอกคะแนน");
    expect(gradeSubmissionSchema.safeParse({ decision: "return", feedback: " " }).error?.issues[0]?.message).toBe(
      "บอกผู้เรียนว่าต้องแก้อะไร",
    );
    expect(gradeSubmissionSchema.parse({ decision: "grade", score: "8.5" })).toEqual({
      decision: "grade",
      score: 8.5,
      feedback: null,
    });
  });

  it("ช่วงคะแนน", () => {
    expect(gradeScoreError(10, 10)).toBeNull();
    expect(gradeScoreError(10.5, 10)).toBe("งานนี้ได้เต็ม 10 คะแนน");
    expect(gradeScoreError(-1, 10)).toBe("คะแนนต้องไม่ติดลบ");
  });
});
