"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import VerdictBadge from "@/components/VerdictBadge";
import type { StockOverview } from "@/lib/db";

/** หน้าแรก: กล่องค้นหา + รายการหุ้นแบ่งตามกลุ่มอุตสาหกรรม กรองแบบ client-side (รายชื่อหุ้นเริ่มยาวขึ้นเรื่อยๆ) */
export default function StockBrowser({
  sections,
  watched = [],
}: {
  sections: { sector: string; stocks: StockOverview[] }[];
  /** ticker ที่คนดูกด ☆ ติดตามไว้ — การ์ดของตัวนั้นมีดาวเหลืองกำกับ */
  watched?: string[];
}) {
  const [query, setQuery] = useState("");
  const watchedSet = useMemo(() => new Set(watched), [watched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((sec) => ({
        sector: sec.sector,
        stocks: sec.stocks.filter(
          (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
        ),
      }))
      .filter((sec) => sec.stocks.length > 0);
  }, [sections, query]);

  const totalShown = filtered.reduce((n, sec) => n + sec.stocks.length, 0);

  return (
    <>
      <div className="stock-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา ticker หรือชื่อบริษัท เช่น CEG, Constellation..."
          aria-label="ค้นหาหุ้น"
        />
        {query && (
          <button type="button" className="stock-search-clear" onClick={() => setQuery("")}>
            ล้าง
          </button>
        )}
      </div>

      {query && (
        <p className="subtitle" style={{ margin: "0 0 16px" }}>
          พบ {totalShown} ตัวที่ตรงกับ &quot;{query}&quot;
        </p>
      )}

      {totalShown === 0 ? (
        <div className="empty-state">ไม่พบหุ้นที่ตรงกับคำค้น &quot;{query}&quot;</div>
      ) : (
        filtered.map((sec) => (
          <section key={sec.sector}>
            <h2 className="sector-heading">
              {sec.sector} <span className="sector-count">({sec.stocks.length})</span>
            </h2>
            <div className="stock-grid">
              {sec.stocks.map((s) => {
                // อัปเดตล่าสุดอาจมาจากทบทวนรายสัปดาห์ (ไม่สร้าง run ใหม่) ไม่ใช่แค่วันวิเคราะห์เต็มครั้งล่าสุด
                const reviewIsNewer =
                  !!s.latest_review_date &&
                  (!s.latest_run_date || s.latest_review_date > s.latest_run_date);
                const updatedDate = reviewIsNewer ? s.latest_review_date : s.latest_run_date;
                const updatedPrice = reviewIsNewer
                  ? s.latest_review_price ?? s.latest_price
                  : s.latest_price;
                return (
                  <Link key={s.ticker} href={`/stock/${s.ticker}`} className="stock-card">
                    <div className="ticker">
                      {s.ticker}
                      {watchedSet.has(s.ticker) && (
                        <span className="card-star" title="ติดตามอยู่" aria-label="ติดตามอยู่">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="name">{s.name}</div>
                    <div className="meta">
                      <VerdictBadge verdict={s.latest_verdict} />
                      <span>
                        {updatedPrice != null && (
                          <>
                            {updatedPrice.toLocaleString()} {s.currency} ·{" "}
                          </>
                        )}
                        {reviewIsNewer ? "ทบทวน " : ""}
                        {updatedDate ?? "ยังไม่มี run"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
