"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import VerdictBadge from "@/components/VerdictBadge";
import WatchButton from "@/components/WatchButton";
import type { SectorGroup } from "@/lib/sectors";

/** ข้อมูลที่การ์ดหน้าแรกใช้ — ฝั่ง server (app/page.tsx) เตรียมให้แล้ว ส่งเข้ามาแค่ที่ต้องโชว์ */
export interface HomeStock {
  ticker: string;
  name: string;
  /** key ของกลุ่มจาก lib/sectors.ts */
  group: string;
  verdict: string | null;
  /** ราคาสด (lib/quote.ts) ถ้าดึงทัน ไม่งั้นราคา ณ รอบทบทวน/รายงานล่าสุด */
  price: number | null;
  /** รหัสสกุลเงินอย่างเดียว (currencyCode) — ไม่เอาข้อความในวงเล็บที่ปนมาใน DB */
  currency: string;
  /** % เปลี่ยนแปลงวันนี้ — มีเฉพาะราคาสด */
  move: number | null;
  /** ป้ายใต้ราคา: "ณ 18 ก.ย." (ราคาจากรายงาน) — ราคาสดไม่มีป้าย ใช้ % วันนี้แทน */
  asOf: string | null;
  watched: boolean;
}

/**
 * หน้าแรก: ค้นหา + ชิปกรองกลุ่ม + การ์ดหุ้นแบบเดียวกับ /watchlist (แบบที่ผู้ใช้เลือก)
 * การ์ด: ticker ใหญ่ + ★ ขวาบนที่เดียว → ชื่อ → ราคา → มุมมอง · ความสูงเท่ากันทุกใบ (ชื่อบรรทัดเดียว ตัดด้วย …)
 * กรองฝั่ง client ทั้งหมด (รายชื่อไม่กี่สิบตัว)
 */
export default function StockBrowser({
  stocks,
  groups,
  canWatch,
}: {
  stocks: HomeStock[];
  groups: SectorGroup[];
  /** มีอีเมลใน session + ระบบติดตามใช้ได้ — ไม่งั้นไม่แสดง ★ (กดแล้วบันทึกไม่ได้) */
  canWatch: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matched = useMemo(
    () => (q ? stocks.filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : stocks),
    [stocks, q]
  );
  // ชิปนับจากผลค้นหา — พิมพ์ค้นแล้วเห็นทันทีว่าเหลือกลุ่มไหนบ้าง
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of matched) m.set(s.group, (m.get(s.group) ?? 0) + 1);
    return m;
  }, [matched]);
  const sections = groups
    .filter((g) => (group ? g.key === group : true))
    .map((g) => ({ ...g, stocks: matched.filter((s) => s.group === g.key) }))
    .filter((g) => g.stocks.length > 0);
  const shown = sections.reduce((n, g) => n + g.stocks.length, 0);

  return (
    <>
      <div className="stock-search hm-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา ticker หรือชื่อบริษัท เช่น CEG"
          aria-label="ค้นหาหุ้น"
        />
        {query && (
          <button type="button" className="stock-search-clear" onClick={() => setQuery("")}>
            ล้าง
          </button>
        )}
      </div>

      <div className="hm-chips" role="group" aria-label="กรองตามกลุ่มอุตสาหกรรม">
        <button type="button" className={`hm-chip${group == null ? " on" : ""}`} aria-pressed={group == null} onClick={() => setGroup(null)}>
          ทั้งหมด <span className="hm-chip-n">{matched.length}</span>
        </button>
        {groups
          .filter((g) => counts.get(g.key))
          .map((g) => (
            <button
              key={g.key}
              type="button"
              className={`hm-chip${group === g.key ? " on" : ""}`}
              aria-pressed={group === g.key}
              onClick={() => setGroup(group === g.key ? null : g.key)}
            >
              {g.label} <span className="hm-chip-n">{counts.get(g.key)}</span>
            </button>
          ))}
      </div>

      {shown === 0 ? (
        <div className="empty-state">
          ไม่พบหุ้นที่ตรงกับคำค้น &quot;{query}&quot;
          {q && (
            <div className="empty-request">
              {/* ฟอร์มขออยู่ที่เมนู "ขอให้วิเคราะห์หุ้น" — ส่ง ticker ที่พิมพ์ค้นไปเติมให้ */}
              <Link href={`/request?ticker=${encodeURIComponent(query.trim().toUpperCase())}`}>
                ขอให้วิเคราะห์ {query.trim().toUpperCase()} →
              </Link>
            </div>
          )}
        </div>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="hm-group">
            <h3 className="hm-group-title">
              {sec.label} <span className="hm-group-n">{sec.stocks.length}</span>
            </h3>
            <div className="hm-grid">
              {sec.stocks.map((s) => (
                <StockCard key={s.ticker} s={s} canWatch={canWatch} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function StockCard({ s, canWatch }: { s: HomeStock; canWatch: boolean }) {
  // ราคาสดบางตัวมาทศนิยม 3 ตำแหน่ง — ตัดเหลือ 2 · ลูกศรดูจากค่าที่ปัดแล้ว ไม่ให้เกิด "▼ 0.0%"
  const m = s.move != null ? Math.round(s.move * 10) / 10 : null;
  return (
    // ★ เป็นปุ่มแยก ไม่ซ้อนใน <a> (ปุ่มใน <a> ผิด HTML) — ลิงก์ขยายเต็มการ์ดด้วย ::after ส่วนดาววางทับขวาบน
    <div className="hm-card">
      <Link href={`/stock/${s.ticker}`} className="hm-card-link">
        <span className="hm-ticker">{s.ticker}</span>
        <span className="hm-name" title={s.name}>
          {s.name}
        </span>
        <span className="hm-pricerow">
          {s.price != null ? (
            <>
              <span className="hm-price">{s.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              {s.currency && <span className="hm-ccy">{s.currency}</span>}
            </>
          ) : (
            <span className="hm-asof">ยังไม่มีราคา</span>
          )}
        </span>
        <span className="hm-sub">
          {m != null ? (
            <span className={`hm-move ${m >= 0 ? "up" : "dn"}`} title="เปลี่ยนแปลงวันนี้">
              {m > 0 ? "▲" : m < 0 ? "▼" : ""} {Math.abs(m).toFixed(1)}% วันนี้
            </span>
          ) : (
            s.asOf && <span className="hm-asof">{s.asOf}</span>
          )}
        </span>
        <span className="hm-foot">
          {s.verdict ? <VerdictBadge verdict={s.verdict} /> : <span className="hm-asof">ยังไม่มีรายงาน</span>}
        </span>
      </Link>
      {canWatch && (
        <div className="hm-star">
          <WatchButton ticker={s.ticker} watching={s.watched} compact />
        </div>
      )}
    </div>
  );
}
