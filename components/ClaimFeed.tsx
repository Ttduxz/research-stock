"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface FeedTab {
  key: string;
  label: string;
  /** สีจุดหน้าชิป — good/warn/bad/unknown (ไม่ใช้ emoji ในชื่อแท็บแล้ว ผู้ใช้อยากให้ดูเป็นงานวิจัย) */
  tone?: string;
}

/** แท็บพิเศษที่ไม่กรองตามผล */
export const ALL_TAB = "all";

/**
 * ตัวกรองรายการ "เคยบอกว่าถ้า → จะส่งผล / ตอนนี้ เพราะ → ส่งผลให้" ของหน้า /track-record
 *
 * การ์ดทุกใบ render ฝั่ง server มาแล้ว (TrackClaimCard — หน้าการ์ดสั้น รายละเอียดอยู่ใน <dialog>)
 * ตัวนี้แค่ซ่อน/แสดงการ์ดตาม ผล + หุ้น และแบ่งหน้าแบบ "แสดงเพิ่ม" (ต่อท้าย ไม่ดันของเดิม — ไม่มี layout กระโดด)
 * เดิมจัดกลุ่มตามหุ้นเป็น <details> ทีละตัว 45 แถว — เปลี่ยนเป็นตาราง card แบนๆ ที่มี ticker ในการ์ดเอง
 * ลิงก์ #claims-<tab> จากส่วนอื่นของหน้าจะเปิดแท็บนั้นให้ทันที
 */
export default function ClaimFeed({
  tabs,
  items,
  defaultTab,
  pageSize,
  children,
}: {
  tabs: FeedTab[];
  /** group + ticker ของการ์ดทุกใบ ตามลำดับเดียวกับ children */
  items: { group: string; ticker: string }[];
  defaultTab: string;
  /** จำนวนการ์ดต่อหน้า — server ซ่อนใบที่เกินไว้แล้วตั้งแต่แรก (ไม่กระพริบตอน hydrate) */
  pageSize: number;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState(defaultTab);
  const [ticker, setTicker] = useState("all");
  const [limit, setLimit] = useState(pageSize);
  const listRef = useRef<HTMLDivElement>(null);

  // จำนวนข้อของหุ้นแต่ละตัว (ตามแท็บที่เลือก) — ใส่ไว้ในตัวเลือกของ select
  const tickers = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.ticker, (m.get(i.ticker) ?? 0) + (tab === ALL_TAB || i.group === tab ? 1 : 0));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, tab]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      if (ticker !== "all" && i.ticker !== ticker) continue;
      m.set(i.group, (m.get(i.group) ?? 0) + 1);
      m.set(ALL_TAB, (m.get(ALL_TAB) ?? 0) + 1);
    }
    return m;
  }, [items, ticker]);

  useEffect(() => {
    const fromHash = () => {
      const key = window.location.hash.replace(/^#claims-/, "");
      if (tabs.some((t) => t.key === key)) {
        setTab(key);
        setLimit(pageSize);
        document.getElementById("claims")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs, pageSize]);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    let n = 0;
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((el) => {
      const ok = (tab === ALL_TAB || el.dataset.group === tab) && (ticker === "all" || el.dataset.ticker === ticker);
      el.hidden = !ok || n >= limit;
      if (ok) n++;
    });
  }, [tab, ticker, limit]);

  const total = counts.get(tab) ?? 0;
  const shown = Math.min(total, limit);
  const pick = (t: string) => {
    setTab(t);
    setLimit(pageSize);
  };

  return (
    <div className="tr2-feed">
      <div className="tr2-filters">
        <div className="tr2-chips" role="group" aria-label="กรองตามผลตรวจ">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tr2-chip${t.key === tab ? " on" : ""}`}
              aria-pressed={t.key === tab}
              data-tone={t.tone}
              onClick={() => pick(t.key)}
            >
              {t.tone && <span className="tr2-dot" aria-hidden="true" />}
              {t.label}
              <b>{counts.get(t.key) ?? 0}</b>
            </button>
          ))}
        </div>
        <label className="tr2-stock-pick">
          <span>หุ้น</span>
          <select
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setLimit(pageSize);
            }}
          >
            <option value="all">ทุกตัว ({tickers.length} บริษัท)</option>
            {tickers.map(([t, n]) => (
              <option key={t} value={t}>
                {t} · {n} ข้อ
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={listRef} className="tr2-grid" hidden={total === 0}>
        {children}
      </div>
      {total === 0 ? (
        <p className="tr2-empty">ไม่มีข้อในหมวดนี้</p>
      ) : (
        <div className="tr2-more">
          <span>
            แสดง {shown} จาก {total} ข้อ
          </span>
          {shown < total && (
            <button type="button" className="tr2-more-btn" onClick={() => setLimit((l) => l + pageSize)}>
              แสดงเพิ่มอีก {Math.min(pageSize, total - shown)} ข้อ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
