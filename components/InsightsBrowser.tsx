"use client";

import { useMemo, useState } from "react";
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

/** แถวชิปกรองหนึ่งชุด — มือถือเลื่อนแนวนอนในแถวเดียว (ไม่ตัดบรรทัดเป็นกำแพงชิป) ดู app/insights/insights.css */
function ChipRow({
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
  return (
    <div className="in2-filter" role="group" aria-label={label}>
      <span className="in2-filter-label">{label}</span>
      <div className="in2-chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`in2-chip${o.key === value ? " on" : ""}`}
            aria-pressed={o.key === value}
            // ชิปที่นับได้ 0 ยังกดได้ (กดแล้วเจอ "ไม่พบ") แต่จางลงให้รู้ล่วงหน้า
            data-empty={o.count === 0 ? "" : undefined}
            onClick={() => onChange(o.key)}
          >
            {o.label}
            {o.count != null && <span className="in2-chip-n">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Grid({ list }: { list: HintWithSegments[] }) {
  return (
    <div className="in2-grid">
      {list.map((h) => (
        <HintCard key={h.slug} hint={h} />
      ))}
    </div>
  );
}

/** หน้า /insights: กรองตามมุมมอง (โอกาส/ความเสี่ยง/ผสม) + กลุ่มอุตสาหกรรม แล้วเลือกลำดับการเรียงเอง
 *  เรื่องที่ยังมีผลขึ้นก่อน (แบ่งชั้นตามผลกระทบเมื่อเรียงตามผลกระทบ) เรื่องที่ปิดแล้วแยกไว้ท้ายหน้าเป็นหมวดของตัวเอง
 */
export default function InsightsBrowser({ hints }: { hints: HintWithSegments[] }) {
  const [direction, setDirection] = useState("all");
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("impact");

  const directionOptions = useMemo(
    () =>
      DIRECTIONS.map((d) => ({
        ...d,
        count: d.key === "all" ? hints.length : hints.filter((h) => h.direction === d.key).length,
      })),
    [hints]
  );

  const byDirection = useMemo(
    () => (direction === "all" ? hints : hints.filter((h) => h.direction === direction)),
    [hints, direction]
  );

  // ลำดับปุ่ม segment ยึดจากจำนวน hint ทั้งหมด (ไม่ใช่จำนวนหลังกรอง) — ปุ่มจะได้ไม่สลับที่ใต้นิ้ว
  // ทุกครั้งที่เปลี่ยนมุมมอง โชว์เฉพาะกลุ่มที่มี hint จริงในระบบ
  const segmentOrder = useMemo(() => {
    const total: Record<string, number> = {};
    for (const h of hints) for (const s of h.segments) total[s] = (total[s] ?? 0) + 1;
    return [...SEGMENTS.map((s) => s.key), OTHER_SEGMENT.key]
      .filter((k) => total[k])
      .sort((a, b) => total[b] - total[a]);
  }, [hints]);

  // ตัวเลขบนชิปนับหลังกรอง direction แล้ว — เลือก "ความเสี่ยง" อยู่ ชิปกลุ่มจึงบอกได้ว่ากดแล้วจะเหลือกี่อัน
  const segmentOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of byDirection) for (const s of h.segments) counts[s] = (counts[s] ?? 0) + 1;
    return [
      { key: "all", label: "ทุกกลุ่ม", count: byDirection.length },
      ...segmentOrder.map((k) => ({ key: k, label: segmentLabel(k), count: counts[k] ?? 0 })),
    ];
  }, [segmentOrder, byDirection]);

  const { active, closed } = useMemo(() => {
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
    // เรื่องที่จบแล้ว/ถูกหักล้างแล้วแยกไว้ท้ายสุดเสมอ (ภายในหมวดยังเรียงตามที่เลือก) — ยังเปิดอ่านย้อนหลังได้
    return {
      active: sorted.filter((h) => isActiveHint(h.status)),
      closed: sorted.filter((h) => !isActiveHint(h.status)),
    };
  }, [byDirection, segment, sort]);

  const shown = active.length + closed.length;
  const filtersOn = direction !== "all" || segment !== "all";
  const reset = () => {
    setDirection("all");
    setSegment("all");
  };

  return (
    <>
      <div className="in2-controls">
        <ChipRow label="มุมมอง" options={directionOptions} value={direction} onChange={setDirection} />
        <ChipRow label="กลุ่ม" options={segmentOptions} value={segment} onChange={setSegment} />
        <div className="in2-bar">
          <label className="in2-sort">
            <span>เรียง</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="เรียงลำดับ insight">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span className="in2-count">
            {shown} จาก {hints.length} เรื่อง
          </span>
          {filtersOn && (
            <button type="button" className="in2-reset" onClick={reset}>
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {shown === 0 ? (
        <div className="in2-none">ไม่พบ insight ที่ตรงกับตัวกรองนี้</div>
      ) : (
        <>
          {active.length > 0 &&
            (sort === "impact" ? (
              groupByImpact(active).map(([label, group]) => (
                <section key={label} className="in2-sec">
                  <h2 className="in2-sec-title">
                    {label} <span className="in2-sec-n">{group.length}</span>
                  </h2>
                  <Grid list={group} />
                </section>
              ))
            ) : (
              <section className="in2-sec">
                <h2 className="in2-sec-title">
                  ยังมีผลอยู่ <span className="in2-sec-n">{active.length}</span>
                </h2>
                <Grid list={active} />
              </section>
            ))}

          {closed.length > 0 && (
            <section className="in2-sec in2-sec-closed">
              <h2 className="in2-sec-title">
                ปิดแล้ว <span className="in2-sec-n">{closed.length}</span>
              </h2>
              <p className="in2-sec-note">ทบทวนแล้วว่าเกิดขึ้นครบ หรือถูกหักล้างแล้ว — เก็บไว้อ่านย้อนหลัง</p>
              <Grid list={closed} />
            </section>
          )}
        </>
      )}
    </>
  );
}
