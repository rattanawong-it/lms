"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { key: string; label: string; count: number };

/**
 * FR-16.3 · Q7 — แนวโน้มการลงทะเบียน 12 เดือน (Recharts)
 * โหลดผ่าน `EnrollmentTrend` แบบ lazy เท่านั้น — ไม่ให้ Recharts เข้า bundle ของหน้าอื่น (NFR-02)
 */
export default function EnrollmentTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={48} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          formatter={(value) => [`${Number(value).toLocaleString("th-TH")} คน`, "ลงทะเบียน"]}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--foreground)",
          }}
        />
        <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
