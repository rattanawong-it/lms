import { linkify } from "@/features/qa/lib/rules";
import { cn } from "@/lib/utils";

/**
 * ข้อความล้วนของผู้ใช้ (Q5) — คงการขึ้นบรรทัด และทำลิงก์ http/https ให้คลิกได้
 * ทุกช่วงเป็น text node ของ React (escape อัตโนมัติ) ไม่มี HTML จากผู้ใช้หลุดเข้า DOM
 */
export function PlainText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("text-[14px] leading-relaxed break-words whitespace-pre-wrap", className)}>
      {linkify(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="nofollow noopener noreferrer ugc"
            className="text-primary underline underline-offset-2 break-all"
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </div>
  );
}
