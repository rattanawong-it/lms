import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBaht } from "@/lib/payment/money";
import type { CourseOffer } from "@/features/commerce/lib/pricing";

/**
 * M18 · FR-18.1 — แผงซื้อคอร์สบนหน้ารายละเอียด (แทนปุ่มลงทะเบียนเมื่อคอร์สมีราคา)
 * ปุ่มเป็นแค่ทางไปหน้าชำระเงิน — ราคาจริงคำนวณใหม่ที่ server ตอนสร้างคำสั่งซื้อ
 */
export function PurchasePanel({
  courseId,
  offer,
  loginHref,
}: {
  courseId: string;
  offer: Exclude<CourseOffer, { kind: "free" }>;
  /** ผู้ที่ยังไม่ล็อกอิน → ไปหน้าเข้าสู่ระบบก่อน */
  loginHref: string | null;
}) {
  return (
    <div className="space-y-3" data-purchase={offer.kind}>
      <p className="num text-[24px] font-bold tracking-[-0.02em]" data-course-price>
        {formatBaht(offer.price)}
      </p>

      {offer.kind === "not-for-sale" ? (
        <>
          <Button className="w-full" size="lg" disabled>
            <ShoppingCart className="size-4" /> ยังซื้อไม่ได้
          </Button>
          <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">{offer.reason}</p>
        </>
      ) : loginHref ? (
        <Button asChild className="w-full" size="lg">
          <Link href={loginHref}>เข้าสู่ระบบเพื่อซื้อคอร์ส</Link>
        </Button>
      ) : (
        <>
          <Button asChild className="w-full" size="lg">
            <Link href={`/checkout/${courseId}`}>
              <ShoppingCart className="size-4" /> ซื้อคอร์ส {formatBaht(offer.price)}
            </Link>
          </Button>
          <p className="text-muted-foreground text-center text-[11.5px] leading-relaxed">
            ชำระด้วยบัตรหรือ PromptPay · เรียนได้ทันทีหลังชำระสำเร็จ
          </p>
        </>
      )}
    </div>
  );
}
