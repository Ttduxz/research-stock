"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface FeedTab {
  key: string;
  label: string;
}

/**
 * แท็บสลับรายการ "เคยพูดว่า → ผล → เพราะอะไร" ของหน้า /track-record
 *
 * การ์ดทุกใบเรนเดอร์ฝั่ง server มาแล้ว (children ที่มี data-group / data-ticker) ตัวนี้แค่ซ่อน/แสดง
 * — ไม่ต้องส่ง markdown parser ไปฝั่ง browser และ server เป็นคนตัดสินว่าแท็บแรกคืออะไร (ไม่กระพริบตอนโหลด)
 * ลิงก์ #claims-<tab> จากการ์ดสรุปด้านบนจะเปิดแท็บนั้นให้ทันที
 */
export default function ClaimFeed({
  tabs,
  items,
  defaultTab,
  children,
}: {
  tabs: FeedTab[];
  /** group + ticker ของการ์ดทุกใบ ใช้นับจำนวนในแท็บเมื่อกรองหุ้น */
  items: { group: string; ticker: string }[];
  defaultTab: string;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState(defaultTab);
  const [ticker, setTicker] = useState("all");
  const listRef = useRef<HTMLDivElement>(null);

  const tickers = useMemo(() => [...new Set(items.map((i) => i.ticker))].sort(), [items]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (ticker === "all" || i.ticker === ticker) m.set(i.group, (m.get(i.group) ?? 0) + 1);
    return m;
  }, [items, ticker]);

  useEffect(() => {
    const fromHash = () => {
      const key = window.location.hash.replace(/^#claims-/, "");
      if (tabs.some((t) => t.key === key)) {
        setTab(key);
        document.getElementById("claims")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>("[data-group]").forEach((el) => {
      el.hidden = el.dataset.group !== tab || (ticker !== "all" && el.dataset.ticker !== ticker);
    });
  }, [tab, ticker]);

  const shown = counts.get(tab) ?? 0;

  return (
    <div className="trk-feed">
      <div className="filter-row">
        <span className="filter-label">ผล</span>
        <div className="filter-pills">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={t.key === tab ? "active" : ""}
              data-active={t.key === tab ? "" : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="pill-count"> {counts.get(t.key) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="filter-label">หุ้น</span>
        <select className="trk-select" value={ticker} onChange={(e) => setTicker(e.target.value)}>
          <option value="all">ทุกตัว</option>
          {tickers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div ref={listRef}>{children}</div>
      {shown === 0 && <p className="trk-lead">ไม่มีข้อในหมวดนี้</p>}
    </div>
  );
}
