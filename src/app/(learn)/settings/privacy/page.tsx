import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { DeletionRequest } from "@/features/privacy/components/deletion-request";
import { DELETED_USER_NAME } from "@/features/privacy/schemas";
import { getMyPrivacyState } from "@/features/privacy/queries";

export const metadata: Metadata = { title: "ความเป็นส่วนตัว" };

/** M17 · FR-17.4 PDPA — ส่งออกข้อมูลของตนเอง และขอลบบัญชี (ผู้ดูแลระบบอนุมัติก่อน — Q9) */
export default async function PrivacySettingsPage() {
  const state = await getMyPrivacyState();

  return (
    <div className="grid grid-cols-1 gap-5">
      <section aria-labelledby="export" className="bg-card border-border min-w-0 rounded-xl border p-4">
        <h2 id="export" className="text-[15px] font-semibold">
          ดาวน์โหลดข้อมูลของฉัน
        </h2>
        <p className="text-muted-foreground mt-1 mb-4 max-w-[640px] text-[12.5px] leading-relaxed">
          ไฟล์ JSON รวมโปรไฟล์ การลงทะเบียนและความคืบหน้า คะแนน งานที่ส่ง (รายชื่อไฟล์) ใบประกาศ กระทู้ถาม-ตอบ
          รีวิว และการแจ้งเตือนของคุณ · ดาวน์โหลดได้วันละ 3 ครั้ง
        </p>
        <Button asChild variant="outline" className="h-11">
          {/* Route Handler ส่งไฟล์กลับมา — ใช้ <a> ธรรมดา ไม่ให้ Link พยายาม prefetch */}
          <a href="/api/privacy/export" download>
            <Download className="size-4" /> ดาวน์โหลดข้อมูล (JSON)
          </a>
        </Button>
        {state.pdpaConsentAt ? (
          <p className="text-muted-foreground mt-3 text-[12px]">
            ให้ความยินยอมตาม{" "}
            <Link href="/privacy" className="text-primary underline-offset-2 hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>{" "}
            เมื่อ <span className="num">{formatDateTime(state.pdpaConsentAt)}</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="delete-account" className="bg-card border-border min-w-0 rounded-xl border p-4">
        <h2 id="delete-account" className="text-[15px] font-semibold">
          ขอลบบัญชี
        </h2>
        <ul className="text-muted-foreground mt-1 mb-4 max-w-[640px] list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed">
          <li>ผู้ดูแลระบบต้องอนุมัติก่อน และจะแจ้งผลทางอีเมล</li>
          <li>เมื่ออนุมัติ ชื่อ อีเมล เบอร์โทร รหัสนักศึกษา รูป และการเชื่อมต่อ LINE จะถูกลบ และเข้าสู่ระบบด้วยบัญชีนี้ไม่ได้อีก</li>
          <li>
            ผลการเรียนและคะแนนเก็บไว้แบบไม่ระบุตัวตนเพื่อสถิติของรายวิชา · ใบประกาศที่ออกแล้วยังตรวจสอบได้ แต่แสดงชื่อเป็น
            “{DELETED_USER_NAME}”
          </li>
          <li>ควรดาวน์โหลดข้อมูลของคุณเก็บไว้ก่อนส่งคำขอ</li>
        </ul>
        <DeletionRequest
          pending={
            state.requestedAt ? { requestedAt: formatDateTime(state.requestedAt), reason: state.reason } : null
          }
          hasPassword={state.hasPassword}
          lastSuperAdmin={state.lastSuperAdmin}
        />
      </section>
    </div>
  );
}
