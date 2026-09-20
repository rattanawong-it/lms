import { Rocket } from "lucide-react";

/**
 * ป้ายบอกว่าฟีเจอร์นี้อยู่ในเฟสถัดไปตาม roadmap ใน spec.md §6
 * ใช้แทนการทำหน้าปลอมที่มีข้อมูลสมมติ
 */
export function PhaseNotice({
  phase,
  title,
  items,
}: {
  phase: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-card border-border rounded-xl border p-6">
      <div className="flex items-start gap-3.5">
        <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Rocket className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            อยู่ในแผนงาน <span className="font-medium">{phase}</span> ตาม roadmap ใน spec.md §6
          </p>
          <ul className="text-fg-3 mt-3.5 space-y-1.5 text-[12.5px]">
            {items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="bg-border mt-[7px] size-1.5 shrink-0 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
