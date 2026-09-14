"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HintCard from "@/components/HintCard";
import { SEGMENTS, OTHER_SEGMENT, segmentLabel } from "@/lib/segments";
import type { HintSummary } from "@/lib/db";
import { isActiveHint } from "@/lib/hint-status";

// เฉพาะคอลัมน์ที่การ์ดใช้ — ทั้งก้อนนี้ถูกส่งไป browser (Client Component) เนื้อหาเต็มของรายงานจึงไม่ควรติดมาด้วย
export type HintWithSegments = HintSummary & { segments: string[] };

const DIRECTIONS: { key: string; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "positive", label: "โอกาส" },
  { key: "negative", label: "ความเสี่ยง" },
  { key: "mixed", label: "ผลกระทบผสม" },
];

const SORTS: { key: string; label: string }[] = [
  { key: "impact", label: "ผลกระทบมากสุด" },
  { key: "newest", label: "ใหม่สุดก่อน" },
  { key: "oldest", label: "เก่าสุดก่อน" },
  { key: "title", label: "ชื่อเรื่อง ก-ฮ" },
];

// แบ่ง 3 ระดับตาม impact_score (1-100) — ใช้เฉพาะตอนเรียงตามผลกระทบ
// เรียงตามวันที่แล้วยังหัวข้อคั่นเป็นชั้น impact อยู่จะอ่านสับสน จึงกลับไปเป็นรายการเดียวแทน
const IMPACT_TIERS: [string, (score: number) => boolean][] = [
  ["กระทบวงกว้างที่สุด", (s) => s >= 85],
  ["กระทบสูง", (s) => s >= 60 && s < 85],
  ["กระทบปานกลาง", (s) => s < 60],
];

const DEFAULT_SCORE = 45; // hint เก่าที่ยังไม่มี impact_score ให้ถือว่ากระทบปานกลาง

function groupByImpact(hints: HintWithSegments[]): [string, HintWithSegments[]][] {
  const groups: [string, HintWithSegments[]][] = IMPACT_TIERS.map(([label]) => [label, []]);
  for (const h of hints) {
    const score = h.impact_score ?? DEFAULT_SCORE;
    const idx = IMPACT_TIERS.findIndex(([, test]) => test(score));
    groups[idx === -1 ? groups.length - 1 : idx][1].push(h);
  }
  return groups.filter(([, list]) => list.length > 0);
}

type Box = { l: number; t: number; w: number; h: number };

/** แถวปุ่มกรองหนึ่งชุด พร้อมแถบไฮไลต์ที่เลื่อนไปหาปุ่มที่เลือก แทนการสลับสีพรวดเดียว */
function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const wrap = pillsRef.current;
      if (!wrap) return;
      const el = wrap.querySelector<HTMLElement>("button[data-active]");
      if (!el) {
        setBox(null);
        return;
      }
      setBox({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // ปุ่มเปลี่ยนความกว้างได้เมื่อตัวเลขในวงเล็บเปลี่ยน จึงวัดใหม่เมื่อรายการปุ่มเปลี่ยนด้วย
  }, [value, options]);

  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      <div className="filter-pills" ref={pillsRef}>
        {box && (
          <span
            className="nav-slider round"
            aria-hidden="true"
            style={{ transform: `translate(${box.l}px, ${box.t}px)`, width: box.w, height: box.h }}
          />
        )}
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={o.key === value ? "active" : ""}
            data-active={o.key === value ? "" : undefined}
            onClick={() => onChange(o.key)}
          >
            {o.label}
            {o.count != null && <span className="pill-count"> {o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** หน้า /insights: กรองตามมุมมอง (โอกาส/ความเสี่ยง/ผสม) + กลุ่มอุตสาหกรรม แล้วเลือกลำดับการเรียงเอง */
export default function InsightsBrowser({ hints }: { hints: HintWithSegments[] }) {
  const [direction, setDirection] = useState("all");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("impact");

  const byDirection = useMemo(
    () => (direction === "all" ? hints : hints.filter((h) => h.direction === direction)),
    [hints, direction]
  );

  // ลำดับปุ่ม segment ยึดจากจำนวน hint ทั้งหมด (ไม่ใช่จำนวนหลังกรอง) — ปุ่มจะได้ไม่สลับที่ใต้เมาส์
  // ทุกครั้งที่เปลี่ยนมุมมอง โชว์เฉพาะกลุ่มที่มี hint จริงในระบบ
  const segmentOrder = useMemo(() => {
    const total: Record<string, number> = {};
    for (const h of hints) for (const s of h.segments) total[s] = (total[s] ?? 0) + 1;
    return [...SEGMENTS.map((s) => s.key), OTHER_SEGMENT.key]
      .filter((k) => total[k])
      .sort((a, b) => total[b] - total[a]);
  }, [hints]);

  // ตัวเลขในวงเล็บนับหลังกรอง direction แล้ว — เลือก "ความเสี่ยง" อยู่ ปุ่มกลุ่มจึงบอกได้ว่ากดแล้วจะเหลือกี่อัน
  const segmentOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of byDirection) for (const s of h.segments) counts[s] = (counts[s] ?? 0) + 1;
    return [
      { key: "all", label: "ทุกกลุ่ม", count: byDirection.length },
      ...segmentOrder.map((k) => ({ key: k, label: segmentLabel(k), count: counts[k] ?? 0 })),
    ];
  }, [segmentOrder, byDirection]);

  const visible = useMemo(() => {
    const list = segment === "all" ? byDirection : byDirection.filter((h) => h.segments.includes(segment));
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => b.run_date.localeCompare(a.run_date) || b.id - a.id);
    else if (sort === "oldest") sorted.sort((a, b) => a.run_date.localeCompare(b.run_date) || a.id - b.id);
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "th"));
    else
      sorted.sort(
        (a, b) =>
          (b.impact_score ?? DEFAULT_SCORE) - (a.impact_score ?? DEFAULT_SCORE) ||
          b.run_date.localeCompare(a.run_date)
      );
    // เรื่องที่จบแล้ว/ถูกหักล้างแล้วไว้ท้ายสุดเสมอ (ภายในแต่ละกลุ่มยังเรียงตามที่เลือก) — ยังเปิดอ่านย้อนหลังได้
    return [...sorted.filter((h) => isActiveHint(h.status)), ...sorted.filter((h) => !isActiveHint(h.status))];
  }, [byDirection, segment, sort]);

  const filtersOn = direction !== "all" || segment !== "all";
  const reset = () => {
    setDirection("all");
    setSegment("all");
  };

  return (
    <>
      <div className="insight-controls">
        <PillGroup label="มุมมอง" options={DIRECTIONS} value={direction} onChange={setDirection} />
        <PillGroup label="กลุ่มอุตสาหกรรม" options={segmentOptions} value={segment} onChange={setSegment} />
        <div className="filter-row">
          <span className="filter-label">เรียงตาม</span>
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="เรียงลำดับ insight"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="filter-result">
            แสดง {visible.length} จาก {hints.length} insight
          </span>
          {filtersOn && (
            <button type="button" className="stock-search-clear" onClick={reset}>
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">ไม่พบ insight ที่ตรงกับตัวกรองนี้</div>
      ) : sort === "impact" ? (
        groupByImpact(visible).map(([label, group]) => (
          <section key={label}>
            <h2 className="sector-heading">
              {label} <span className="sector-count">({group.length})</span>
            </h2>
            <div className="stock-grid">
              {group.map((h) => (
                <HintCard key={h.slug} hint={h} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <section>
          <div className="stock-grid">
            {visible.map((h) => (
              <HintCard key={h.slug} hint={h} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
