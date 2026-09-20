import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/**
 * ชั้น abstraction ของอีเมล — เลือกผู้ให้บริการผ่าน env (D-02 ยังไม่ตัดสินใจ)
 * dev ใช้ Mailpit (SMTP) · production สลับเป็น Resend ได้โดยไม่แก้โค้ดที่เรียกใช้
 */
export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

async function sendViaSmtp(message: MailMessage) {
  if (!env.SMTP_URL) throw new Error("ต้องกำหนด SMTP_URL เมื่อ EMAIL_PROVIDER=smtp");
  const transport = nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({ from: env.EMAIL_FROM, ...message });
}

async function sendViaResend(message: MailMessage) {
  if (!env.RESEND_API_KEY) throw new Error("ต้องกำหนด RESEND_API_KEY เมื่อ EMAIL_PROVIDER=resend");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });
  if (!res.ok) throw new Error(`ส่งอีเมลผ่าน Resend ไม่สำเร็จ (${res.status})`);
}

export async function sendMail(message: MailMessage) {
  if (env.EMAIL_PROVIDER === "resend") return sendViaResend(message);
  return sendViaSmtp(message);
}

/** เทมเพลตอีเมลกลาง — ภาษาไทย, inline style เพื่อให้แสดงผลได้ในทุก mail client */
export function renderEmail(opts: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
}) {
  return `<!doctype html>
<html lang="th">
  <body style="margin:0;background:#f8f9fa;padding:32px 16px;font-family:'Segoe UI',Tahoma,sans-serif;color:#202124;line-height:1.7">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dadce0;border-radius:14px;overflow:hidden">
      <div style="background:#1a73e8;padding:20px 28px;color:#ffffff">
        <div style="font-size:15px;font-weight:600">มหาวิทยาลัยเกริก</div>
        <div style="font-size:12px;opacity:.85">ระบบจัดการเรียนรู้ออนไลน์ · KRIRK LMS</div>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:700">${opts.heading}</h1>
        <p style="margin:0 0 22px;font-size:14px;color:#5f6368">${opts.body}</p>
        <a href="${opts.ctaUrl}" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:9px;font-size:14px;font-weight:600">${opts.ctaLabel}</a>
        <p style="margin:22px 0 0;font-size:12px;color:#80868b">${opts.footnote}</p>
        <p style="margin:14px 0 0;font-size:11px;color:#80868b;word-break:break-all">หากปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br />${opts.ctaUrl}</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #e8eaed;font-size:11px;color:#80868b">
        อีเมลฉบับนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ · การเข้าสู่ระบบทุกครั้งถูกบันทึกตาม PDPA
      </div>
    </div>
  </body>
</html>`;
}
