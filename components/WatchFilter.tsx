"use client";

import { useState } from "react";

/**
 * ชิปนับตามสถานะแผนบนหน้า /watchlist ที่กดกรองได้ — กดซ้ำ = ดูทั้งหมด
 * กรองด้วย CSS (data-f บน wrapper) ไม่ต้อง render การ์ดใหม่ — การ์ดยังเป็น server component ทั้งหมด
 * ตัวที่เลือกไม่จำข้ามการเปิดหน้า (ตั้งใจ: เปิดหน้ามาต้องเห็นครบก่อนเสมอ)
 */
export default function WatchFilter({
  counts,
  children,
}: {
  counts: { plan: string; label: string; n: number }[];
  children: React.ReactNode;
}) {
  const [f, setF] = useState<string | null>(null);
  const total = counts.reduce((a, c) => a + c.n, 0);
  return (
    <div className="wl-shell" data-f={f ?? undefined}>
      <div className="wl-filter" role="group" aria-label="กรองตามสถานะแผน">
        <button type="button" className={`wl-fchip${f == null ? " on" : ""}`} aria-pressed={f == null} onClick={() => setF(null)}>
          ทั้งหมด <b>{total}</b>
        </button>
        {counts.map((c) => (
          <button
            key={c.plan}
            type="button"
            className={`wl-fchip ps-${c.plan}${f === c.plan ? " on" : ""}`}
            aria-pressed={f === c.plan}
            onClick={() => setF(f === c.plan ? null : c.plan)}
          >
            <i className="wc-dot" aria-hidden="true" />
            {c.label} <b>{c.n}</b>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
