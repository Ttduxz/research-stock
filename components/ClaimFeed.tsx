"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface FeedTab {
  key: string;
  label: string;
}

/**
 * แท็บสลับรายการ "เคยพูดว่า → ผล → เพราะอะไร" ของหน้า /track-record
 *
 * การ์ดทุกใบเรนเดอร์ฝั่ง server มาแล้ว จัดกลุ่มตามหุ้นเป็น <details data-stock-group> ที่พับไว้เหลือแค่ชื่อหุ้น
 * (ถ้าแสดงทุกข้อทีเดียว หุ้นที่มีหลายสิบข้อจะท่วมหน้า) ตัวนี้แค่ซ่อน/แสดงการ์ดตามแท็บ ซ่อนกลุ่มที่ไม่เหลือการ์ด
 * และอัปเดตจำนวนข้อบนแถบชื่อหุ้น — ไม่ต้องส่ง markdown parser ไปฝั่ง browser
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
    const root = listRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((el) => {
      el.hidden = el.dataset.group !== tab || (ticker !== "all" && el.dataset.ticker !== ticker);
    });
    root.querySelectorAll<HTMLDetailsElement>("[data-stock-group]").forEach((group) => {
      const n = group.querySelectorAll("[data-group]:not([hidden])").length;
      group.hidden = n === 0;
      const count = group.querySelector<HTMLElement>("[data-stock-count]");
      if (count) count.textContent = `${n} ข้อ`;
      // เลือกหุ้นตัวเดียว = ตั้งใจจะอ่านตัวนั้น กางให้เลย; กลับไป "ทุกตัว" ปล่อยตามที่ผู้ใช้กางไว้
      if (ticker !== "all") group.open = group.dataset.stockGroup === ticker;
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

      <div ref={listRef} className="trk-stocks" hidden={shown === 0}>
        {children}
      </div>
      {shown === 0 && <p className="trk-lead">ไม่มีข้อในหมวดนี้</p>}
    </div>
  );
}
