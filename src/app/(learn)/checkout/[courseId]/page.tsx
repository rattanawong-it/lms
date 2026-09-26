import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/features/commerce/components/checkout-button";
import { getCheckout } from "@/features/commerce/queries";
import { ORDER_TTL_MINUTES } from "@/features/commerce/schemas";

export const metadata: Metadata = { title: "ชำระเงิน" };

/** M18 · FR-18.1 — สรุปรายการก่อนไปหน้าชำระเงิน + คูปอง (ข้อมูลใบเสร็จขั้น 4) */
export default async function CheckoutPage(props: PageProps<"/checkout/[courseId]">) {
  const { courseId } = await props.params;
  const view = await getCheckout(courseId);

  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="ชำระเงิน" description="ตรวจสอบรายการก่อนไปหน้าชำระเงิน" />

      <section aria-labelledby="summary" className="bg-card border-border rounded-xl border p-5">
        <h2 id="summary" className="sr-only">
          สรุปรายการ
        </h2>
        <p className="text-muted-foreground text-[12px]">คอร์ส</p>
        <p className="text-[16px] font-semibold">{view.course.title}</p>
        {view.course.summary ? <p className="text-muted-foreground mt-1 text-[13px]">{view.course.summary}</p> : null}

        {view.alreadyEnrolled ? (
          <div className="mt-5 space-y-3">
            <p className="bg-success-bg text-success-fg rounded-lg p-3 text-[13px]">คุณมีสิทธิ์เรียนคอร์สนี้อยู่แล้ว</p>
            <Button asChild className="h-11 w-full">
              <Link href={`/learn/${view.course.id}`}>ไปหน้าเรียน</Link>
            </Button>
          </div>
        ) : view.offer.kind === "buy" ? (
          <>
            <div className="mt-5">
              <CheckoutButton courseId={view.course.id} price={view.offer.price} />
            </div>
            <p className="text-muted-foreground mt-3 text-[11.5px] leading-relaxed">
              คำสั่งซื้อมีอายุ {ORDER_TTL_MINUTES} นาที · ชำระสำเร็จแล้วเริ่มเรียนได้ทันทีและเรียนได้ตลอด ·
              ขอคืนเงินได้ภายใน 7 วันหากเรียนไม่เกิน 20%
              {view.pendingOrderId ? " · คำสั่งซื้อที่ยังไม่ชำระก่อนหน้าจะถูกแทนที่" : ""}
            </p>
          </>
        ) : view.offer.kind === "not-for-sale" ? (
          <p className="bg-muted mt-5 rounded-lg p-3 text-[13px]">{view.offer.reason}</p>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-[13px]">คอร์สนี้เรียนฟรี ไม่ต้องชำระเงิน</p>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={`/courses/${view.course.slug}`}>ไปหน้าคอร์สเพื่อลงทะเบียน</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
