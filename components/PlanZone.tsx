import type { EntryPlan } from "@/lib/db";

/**
 * "ราคาอยู่ตรงไหนเทียบไม้ของแผน" — ใช้ในหน้า /watchlist
 * เคยเป็นแถบกราฟิก (โซนไม้เป็นช่องสี + ขีดราคา) ผู้ใช้บอกว่า "ชวนสับสนสุดๆ" — ช่องไม่มีตัวเลขกำกับ ต้องเดาเองว่าอะไรคืออะไร
 * จึงเหลือแค่ช่วงราคาของไม้ที่ใกล้ที่สุด + ระยะห่างเป็น % ที่อ่านจบในตัว
 * บอกแค่ตำแหน่งราคา ไม่ได้บอกว่าเงื่อนไขของไม้ครบ — สถานะแผนจริงมาจากรอบทบทวน (plan_status) เท่านั้น
 */

export interface Tranche {
  range: string;
  low: number;
  high: number;
}

/** อ่านช่วงราคาทุกไม้ เรียงแพง→ถูก (ไม่เชื่อ level ดิบ เหมือน lib/ranking.ts) */
export function parseTranches(raw: string | null): Tranche[] {
  if (!raw) return [];
  let plan: EntryPlan;
  try {
    plan = JSON.parse(raw) as EntryPlan;
  } catch {
    return [];
  }
  const out: Tranche[] = [];
  for (const t of plan.tranches ?? []) {
    const nums = (t?.price_range?.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
    if (nums.length === 0) continue;
    out.push({ range: t.price_range, low: Math.min(...nums), high: Math.max(...nums) });
  }
  return out.sort((a, b) => b.high - a.high);
}

const pct = (v: number) => `${v.toFixed(1)}%`;

export interface ZoneInfo {
  /** ไม้ที่ใกล้ราคาที่สุด เช่น "ไม้ 1 $170-173" */
  zone: string;
  /** "ห่าง 2.6%" / "อยู่ในช่วง" / "ต่ำกว่า 3.0%" */
  where: string;
  tone: "" | "in" | "below";
  /** % ที่ราคาสูงกว่าขอบบนไม้ 1 (0 = ถึงโซนไม้แล้ว, ติดลบ = ต่ำกว่าทุกไม้) — ใช้เรียง */
  dist: number;
}

/** ตำแหน่งราคาเทียบไม้ของแผน (ตำแหน่งเท่านั้น ไม่ใช่สถานะแผน) */
export function zoneInfo(tranches: Tranche[], price: number): ZoneInfo | null {
  if (tranches.length === 0) return null;
  const first = tranches[0];
  const last = tranches[tranches.length - 1];
  const inIdx = tranches.findIndex((t) => price >= t.low && price <= t.high);
  if (price > first.high) {
    const d = ((price - first.high) / price) * 100;
    return { zone: `ไม้ 1 ${first.range}`, where: `ห่าง ${pct(d)}`, tone: "", dist: d };
  }
  if (inIdx >= 0) return { zone: `ไม้ ${inIdx + 1} ${tranches[inIdx].range}`, where: "อยู่ในช่วง", tone: "in", dist: 0 };
  if (price < last.low) {
    const d = ((last.low - price) / price) * 100;
    return { zone: `ไม้สุดท้าย ${last.range}`, where: `ต่ำกว่า ${pct(d)}`, tone: "below", dist: -d };
  }
  const next = tranches.findIndex((t) => t.high < price);
  const d = ((price - tranches[next].high) / price) * 100;
  return { zone: `ไม้ ${next + 1} ${tranches[next].range}`, where: `ห่าง ${pct(d)}`, tone: "", dist: 0 };
}


/**
 * แถบกำกับเต็ม — รอบแรกเป็นช่องสีไม่มีตัวเลข ผู้ใช้บอกว่า "ชวนสับสนสุดๆ" รอบนี้ทุกอย่างบนแถบมีป้ายของตัวเอง:
 * บรรทัดบน = ไม้ที่ใกล้สุด + ระยะห่าง (อ่านจบได้โดยไม่ต้องดูแถบ) · เลขไม้ 1/2/3 อยู่ในช่อง
 * ขีดราคามีป้าย "ราคาตอนนี้" ใต้แถบ · เส้นประจากราคาถึงไม้ 1 คือระยะที่ต้องลงมาอีก · ซ้าย = ราคาต่ำ ขวา = ราคาสูง
 */
export default function PlanZone({
  tranches,
  info,
  price,
  live = true,
}: {
  tranches: Tranche[];
  info: ZoneInfo | null;
  price: number | null;
  /** false = ดึงราคาสดไม่ได้ ใช้ราคาวันทบทวนแทน — ป้ายต้องไม่บอกว่าเป็น "ราคาตอนนี้" */
  live?: boolean;
}) {
  if (!info || price == null || tranches.length === 0) return null;
  const lo = Math.min(tranches[tranches.length - 1].low, price);
  const hi = Math.max(tranches[0].high, price);
  const pad = (hi - lo) * 0.08 || hi * 0.02;
  const min = lo - pad;
  const span = hi + pad - min;
  const at = (v: number) => ((v - min) / span) * 100;
  const nowX = at(price);
  const gapFrom = at(tranches[0].high);

  return (
    <div className={`pz ${info.tone}`}>
      <div className="pz-text">
        <span className="pz-zone">{info.zone}</span>
        <span className="pz-where">{info.where}</span>
      </div>
      <div className="pzb" aria-hidden="true">
        <div className="pzb-track">
          {price > tranches[0].high && (
            <span className="pzb-gap" style={{ left: `${gapFrom}%`, width: `${nowX - gapFrom}%` }} />
          )}
          {tranches.map((t, i) => {
            const left = at(t.low);
            const width = Math.max(at(t.high) - left, 6);
            return (
              <span key={i} className={`pzb-zone z${Math.min(i + 1, 3)}`} style={{ left: `${Math.min(left, 100 - width)}%`, width: `${width}%` }}>
                {i + 1}
              </span>
            );
          })}
          <span className="pzb-now" style={{ left: `${nowX}%` }} />
        </div>
        <span className={`pzb-now-label${nowX > 80 ? " end" : nowX < 20 ? " start" : ""}`} style={{ left: `${nowX}%` }}>
          ▲ {live ? "ราคาตอนนี้" : "ราคา ณ ทบทวน"}
        </span>
      </div>
    </div>
  );
}
